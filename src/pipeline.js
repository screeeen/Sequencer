// Orquesta la generación del estrobo capturando frames DURANTE la
// reproducción del vídeo (no por seeking): así funciona en iOS, el progreso
// es natural (tiempo/duración) y no hay "scrubbing".
//
// Flujo:
//   play -> captura frames a intervalos -> ended -> fondo (mediana) -> componer
// Los frames se cachean para recomponer al instante al cambiar parámetros.

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
  let intervalMs = 100;
  let effInterval = intervalMs;
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

  /** Captura el frame actual del vídeo a la resolución de trabajo del estrobo. */
  const grab = () => {
    const w = strobe.width;
    const h = strobe.height;
    if (capture.width !== w) capture.width = w;
    if (capture.height !== h) capture.height = h;
    captureCtx.drawImage(video, 0, 0, w, h);
    return captureCtx.getImageData(0, 0, w, h);
  };

  // --- Captura durante la reproducción ---

  const maybeCapture = () => {
    if (p.frames.length >= MAX_FRAMES) return;
    if (!video.videoWidth) return;
    const tMs = video.currentTime * 1000;
    if (p.frames.length === 0 || tMs - lastMs >= effInterval) {
      p.frames.push(grab());
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
    p.frames = [];
    lastMs = -Infinity;

    const durMs = (video.duration || 0) * 1000;
    // Espaciado efectivo: respeta lo pedido pero garantiza <= MAX_FRAMES.
    effInterval = durMs ? Math.max(intervalMs, durMs / MAX_FRAMES) : intervalMs;

    if (supportsRVFC) rvfcLoop();
    else timeoutLoop();
  };

  const composeAll = async () => {
    strobe.resetAccumulator();
    const total = p.frames.length;
    for (let i = 0; i < total; i++) {
      const frame = p.frames[i];
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
      // Modelo de fondo (mediana de un subconjunto).
      p.onProgress("modeling", 0);
      await yieldToUI();
      const step = Math.max(1, Math.floor(p.frames.length / MAX_BG_SAMPLES));
      const bgFrames = p.frames.filter((_, i) => i % step === 0);
      strobe.setBackground(bgFrames);
      await yieldToUI();
      await composeAll();
    } finally {
      p.busy = false;
    }
  };

  /** Recompone el estrobo desde los frames cacheados (parámetros nuevos). */
  p.recompose = async () => {
    if (p.busy || !strobe.ready || p.frames.length === 0) return;
    p.busy = true;
    try {
      await composeAll();
    } finally {
      p.busy = false;
    }
  };

  Object.defineProperty(p, "hasFrames", { get: () => p.frames.length > 0 });

  video.addEventListener("play", onPlay);
  video.addEventListener("ended", onEnded);

  return p;
}
