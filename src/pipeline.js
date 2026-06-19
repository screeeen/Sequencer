// Orquesta la generación del estrobo capturando frames DURANTE la
// reproducción del vídeo (no por seeking): así funciona en iOS, el progreso
// es natural (tiempo/duración) y no hay "scrubbing".
//
// Flujo:
//   play -> captura frames densos -> ended -> fondo (mediana) -> componer
// La captura es lo más densa posible (hasta MAX_FRAMES). El slider de intervalo
// NO recaptura: submuestrea la caché y recompone. Los frames se cachean para
// recomponer al instante al cambiar cualquier parámetro.

const MAX_FRAMES = 60; // cota de frames cacheados (memoria)
const MAX_BG_SAMPLES = 25; // frames usados para la mediana de fondo

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

  // Estado público (la UI lo lee/escribe).
  const p = {
    frames: [], // ImageData[] capturados durante la reproducción
    busy: false,
    onProgress: () => {}, // (phase, fraction)
  };

  p.setInterval = (ms) => {
    intervalMs = ms;
  };

  /** Vacía la caché (al cargar otro vídeo). */
  p.clear = () => {
    p.frames = [];
    frameTimes = [];
  };

  /** Captura el frame actual del vídeo a la resolución de trabajo del estrobo. */
  const grab = () => {
    const w = strobe.width;
    const h = strobe.height;
    if (capture.width !== w) capture.width = w;
    if (capture.height !== h) capture.height = h;
    captureCtx.drawImage(video, 0, 0, w, h);
    return captureCtx.getImageData(0, 0, w, h);
  };

  /** Submuestrea la caché: primer frame + los espaciados >= intervalMs. */
  const selectFrames = (ms) => {
    const sel = [];
    let last = -Infinity;
    for (let i = 0; i < p.frames.length; i++) {
      if (i === 0 || frameTimes[i] - last >= ms) {
        sel.push(p.frames[i]);
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
    if (p.frames.length === 0 || tMs - lastMs >= captureInterval) {
      p.frames.push(grab());
      frameTimes.push(tMs);
      lastMs = tMs;
      const frac = video.duration ? video.currentTime / video.duration : 0;
      p.onProgress("capturing", Math.min(1, frac));
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
    if (video.videoWidth) strobe.resize(video.videoWidth, video.videoHeight);
    p.clear();
    lastMs = -Infinity;

    // Captura lo más densa posible (acotada a MAX_FRAMES); el intervalo del
    // usuario se aplica luego submuestreando, sin recapturar.
    const durMs = (video.duration || 0) * 1000;
    captureInterval = durMs ? durMs / MAX_FRAMES : 30;

    if (supportsRVFC) rvfcLoop();
    else timeoutLoop();
  };

  const composeAll = async (list) => {
    strobe.resetAccumulator();
    const total = list.length;
    for (let i = 0; i < total; i++) {
      const frame = list[i];
      const alpha = strobe.maskFrame(frame);
      strobe.composite(frame, alpha);
      strobe.flush();
      p.onProgress("compositing", (i + 1) / total);
      await yieldToUI();
    }
    p.onProgress("done", 1);
  };

  const onEnded = async () => {
    if (p.busy || p.frames.length < 2) return;
    p.busy = true;
    try {
      // Modelo de fondo: mediana de un subconjunto de TODA la caché (robusto).
      p.onProgress("modeling", 0);
      await yieldToUI();
      const step = Math.max(1, Math.floor(p.frames.length / MAX_BG_SAMPLES));
      const bgFrames = p.frames.filter((_, i) => i % step === 0);
      strobe.setBackground(bgFrames);
      await yieldToUI();
      await composeAll(selectFrames(intervalMs));
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
      await composeAll(selectFrames(intervalMs));
    } finally {
      p.busy = false;
    }
  };

  Object.defineProperty(p, "hasFrames", { get: () => p.frames.length > 0 });

  video.addEventListener("play", onPlay);
  video.addEventListener("ended", onEnded);

  return p;
}
