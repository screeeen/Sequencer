// Orquesta la generación del estrobo capturando frames DURANTE la
// reproducción del vídeo (no por seeking): así funciona en iOS, el progreso
// es natural (tiempo/duración) y no hay "scrubbing".
//
// Flujo:
//   play -> captura frames densos -> ended -> fondo (mediana) -> componer
// La captura es lo más densa posible (hasta MAX_FRAMES). El slider de intervalo
// NO recaptura: submuestrea la caché y recompone. Los frames se cachean para
// recomponer al instante al cambiar cualquier parámetro.

import { otsuThreshold } from "./imageops.js";

const MAX_FRAMES = 60; // cota de frames cacheados (memoria)
const MAX_BG_SAMPLES = 25; // frames usados para la mediana de fondo
const MAX_ANALYZE_SAMPLES = 16; // frames usados para el auto-threshold
const SIGMA_MAX = 16; // rango del histograma de scores (en sigmas)

/** Cede el hilo para que el navegador repinte (progreso fluido). */
function yieldToUI() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * @param {HTMLVideoElement} video
 * @param {ReturnType<import("./strobe.js").createStrobe>} strobe
 */
export function createPipeline(video, strobe) {
  // Estado privado.
  const capture = document.createElement("canvas");
  const captureCtx = capture.getContext("2d", { willReadFrequently: true });
  const supportsRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
  let frameTimes = []; // tiempo de medios (ms) de cada frame cacheado
  let intervalMs = 100; // separación pedida por el usuario (submuestreo)
  let captureInterval = 30; // separación de captura (lo más densa posible)
  let lastMs = -Infinity;
  let trimIn = 0; // segmento a capturar, en segundos
  let trimOut = Infinity;
  let wakeLock = null; // evita que la pantalla se apague a mitad de captura

  // Estado público (la UI lo lee/escribe).
  const p = {
    frames: [], // ImageData[] capturados durante la reproducción
    busy: false,
    cropper: null, // recorte espacial (src/cropper.js); null = frame completo
    recorder: null, // graba el canvas durante la composición (src/recorder.js)
    onProgress: () => {}, // (phase, fraction)
    onAutoThreshold: () => {}, // (threshold) — la UI refleja el valor calculado
  };

  p.setInterval = (ms) => {
    intervalMs = ms;
  };

  p.setTrim = (inS, outS) => {
    trimIn = inS;
    trimOut = outS;
  };

  /** Trim/crop cambian qué se captura: la caché deja de valer -> replay. */
  p.invalidate = () => {
    p.clear();
    p.onProgress("stale", 0);
  };

  const acquireWakeLock = async () => {
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock = null;
    }
  };
  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  };

  /** Rect de recorte en píxeles del vídeo (frame completo si no hay crop). */
  const cropRect = () => {
    const c = p.cropper;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!c || c.isFull) return { sx: 0, sy: 0, sw: vw, sh: vh };
    return {
      sx: Math.round(c.x * vw),
      sy: Math.round(c.y * vh),
      sw: Math.max(1, Math.round(c.w * vw)),
      sh: Math.max(1, Math.round(c.h * vh)),
    };
  };

  /** Vacía la caché (al cargar otro vídeo). */
  p.clear = () => {
    p.frames = [];
    frameTimes = [];
  };

  /** Captura el frame actual (con el crop aplicado) a resolución de trabajo. */
  const grab = () => {
    const w = strobe.width;
    const h = strobe.height;
    if (capture.width !== w) capture.width = w;
    if (capture.height !== h) capture.height = h;
    const r = cropRect();
    captureCtx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    return captureCtx.getImageData(0, 0, w, h);
  };

  /** Submuestrea la caché: índices del primer frame + los espaciados >= intervalMs. */
  const selectIndices = (ms) => {
    const sel = [];
    let last = -Infinity;
    for (let i = 0; i < p.frames.length; i++) {
      if (i === 0 || frameTimes[i] - last >= ms) {
        sel.push(i);
        last = frameTimes[i];
      }
    }
    return sel;
  };

  // --- Captura durante la reproducción ---

  const maybeCapture = () => {
    if (p.frames.length >= MAX_FRAMES) return;
    if (!video.videoWidth) return;
    const tMs = video.currentTime * 1000;
    const inMs = trimIn * 1000;
    const outMs = Math.min((video.duration || Infinity) * 1000, trimOut * 1000);
    if (tMs < inMs) return; // aún no hemos llegado al segmento
    if (tMs > outMs) {
      // Fin del segmento: paramos y componemos sin esperar a "ended".
      video.pause();
      finish();
      return;
    }
    if (p.frames.length === 0 || tMs - lastMs >= captureInterval) {
      p.frames.push(grab());
      frameTimes.push(tMs);
      lastMs = tMs;
      const frac = (tMs - inMs) / Math.max(1, outMs - inMs);
      p.onProgress("capturing", Math.min(1, Math.max(0, frac)));
    }
  };

  const rvfcLoop = () => {
    video.requestVideoFrameCallback(() => {
      maybeCapture();
      if (!video.paused && !video.ended) rvfcLoop();
    });
  };

  const timeoutLoop = () => {
    if (video.paused || video.ended) return;
    maybeCapture();
    setTimeout(timeoutLoop, 30);
  };

  const onPlay = () => {
    if (p.busy) return;
    if (video.videoWidth) {
      const r = cropRect();
      strobe.resize(r.sw, r.sh); // el crop recupera resolución de trabajo
    }
    p.clear();
    lastMs = -Infinity;

    // Reproducimos desde el inicio del segmento de trim.
    if (video.currentTime < trimIn || video.currentTime >= trimOut) {
      video.currentTime = trimIn;
    }

    // Captura lo más densa posible (acotada a MAX_FRAMES) dentro del
    // segmento; el intervalo del usuario se aplica luego submuestreando.
    const outS = Math.min(video.duration || Infinity, trimOut);
    const spanMs = Math.max(0, outS - trimIn) * 1000;
    captureInterval = spanMs && isFinite(spanMs) ? spanMs / MAX_FRAMES : 30;

    acquireWakeLock();
    if (supportsRVFC) rvfcLoop();
    else timeoutLoop();
  };

  const composeAll = async (indices) => {
    // La grabación arranca sobre el fondo limpio: el vídeo enseña las
    // siluetas apareciendo una a una, tal cual lo ve el usuario.
    p.recorder?.start();
    strobe.resetAccumulator();
    const total = indices.length;
    for (let i = 0; i < total; i++) {
      const idx = indices[i];
      const frame = p.frames[idx];
      // Vecinos DENSOS de la caché para la pista de movimiento (3-frame
      // differencing): miden movimiento real (~captureInterval de separación)
      // sea cual sea el intervalo elegido por el usuario.
      const alpha = strobe.maskFrame(frame, p.frames[idx - 1], p.frames[idx + 1]);
      strobe.composite(frame, alpha);
      strobe.flush();
      p.onProgress("compositing", (i + 1) / total);
      await yieldToUI();
    }
    p.onProgress("done", 1);
    if (p.recorder?.recording) {
      // Sostiene el strobo terminado ~0.5s antes de cerrar el vídeo (los
      // re-flush fuerzan frames en el stream aunque el canvas no cambie).
      for (let k = 0; k < 10; k++) {
        strobe.flush();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      p.recorder.stop();
    }
  };

  /**
   * Auto-threshold: acumula el histograma de scores (sigmas) de frames
   * muestreados y separa ruido de fondo vs sujeto con Otsu. Devuelve el
   * threshold en unidades del slider (sigma * 8, acotado a un rango sensato)
   * junto con los datos del análisis para poder visualizarlo.
   */
  const analyzeThreshold = async () => {
    p.onProgress("analyzing", 0);
    const hist = new Uint32Array(256);
    const step = Math.max(1, Math.floor(p.frames.length / MAX_ANALYZE_SAMPLES));
    const samples = p.frames.filter((_, i) => i % step === 0);
    for (let i = 0; i < samples.length; i++) {
      strobe.scoreHistogram(samples[i], hist, SIGMA_MAX);
      p.onProgress("analyzing", (i + 1) / samples.length);
      await yieldToUI();
    }
    const cutSigma = (otsuThreshold(hist) * SIGMA_MAX) / hist.length;
    const threshold = Math.round(Math.min(80, Math.max(16, cutSigma * 8)));
    return { threshold, hist, cutSigma, sigmaMax: SIGMA_MAX, sampleCount: samples.length };
  };

  /** Cierra la captura y lanza fondo + análisis + composición. */
  const finish = async () => {
    if (p.busy || p.frames.length < 2) return;
    releaseWakeLock();
    p.busy = true;
    try {
      // Modelo de fondo: mediana de un subconjunto de TODA la caché (robusto).
      p.onProgress("modeling", 0);
      await yieldToUI();
      const step = Math.max(1, Math.floor(p.frames.length / MAX_BG_SAMPLES));
      const bgFrames = p.frames.filter((_, i) => i % step === 0);
      strobe.setBackground(bgFrames);
      await yieldToUI();
      const analysis = await analyzeThreshold();
      strobe.threshold = analysis.threshold;
      p.onAutoThreshold(analysis.threshold, analysis);
      await composeAll(selectIndices(intervalMs));
    } finally {
      p.busy = false;
    }
  };

  /**
   * Recompone desde la caché con los parámetros actuales (umbral, color o
   * intervalo). El intervalo decide qué frames se componen.
   */
  p.recompose = async () => {
    if (p.busy || !strobe.ready || p.frames.length === 0) return;
    p.busy = true;
    try {
      await composeAll(selectIndices(intervalMs));
    } finally {
      p.busy = false;
    }
  };

  Object.defineProperty(p, "hasFrames", { get: () => p.frames.length > 0 });

  video.addEventListener("play", onPlay);
  video.addEventListener("ended", finish);
  video.addEventListener("pause", releaseWakeLock);

  return p;
}
