// Orquesta la generación del estrobo en una pre-pasada offline:
//   1. Recorre el vídeo por seeking y captura frames.
//   2. Construye el fondo (mediana) con un subconjunto de esos frames.
//   3. Compone el estrobo enmascarando cada frame.
// Cachea los frames capturados para recomponer al instante cuando cambian
// parámetros (umbral, color, highlight) sin volver a recorrer el vídeo.

const MAX_FRAMES = 60; // cota de frames cacheados (memoria)
const MAX_BG_SAMPLES = 25; // frames usados para la mediana de fondo

/** Espera a que el vídeo termine de buscar a un instante dado. */
function seekTo(video, t) {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
  });
}

/** Cede el hilo para que el navegador repinte (progreso fluido). */
function yieldToUI() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export class Pipeline {
  /**
   * @param {HTMLVideoElement} video
   * @param {import("./strobe.js").Strobe} strobe
   */
  constructor(video, strobe) {
    this.video = video;
    this.strobe = strobe;
    this.capture = document.createElement("canvas");
    this.captureCtx = this.capture.getContext("2d", {
      willReadFrequently: true,
    });
    this.frames = []; // ImageData[] capturados
    this.busy = false;
    this.onProgress = () => {}; // (phase, fraction)
  }

  get hasFrames() {
    return this.frames.length > 0;
  }

  /** Captura un frame del vídeo a la resolución de trabajo del estrobo. */
  _grab() {
    const w = this.strobe.width;
    const h = this.strobe.height;
    if (this.capture.width !== w) this.capture.width = w;
    if (this.capture.height !== h) this.capture.height = h;
    this.captureCtx.drawImage(this.video, 0, 0, w, h);
    return this.captureCtx.getImageData(0, 0, w, h);
  }

  /** Pre-pasada completa: capturar, modelar fondo y componer. */
  async generate(intervalMs) {
    if (this.busy) return;
    this.busy = true;
    try {
      const video = this.video;
      video.pause();
      if (!video.duration || Number.isNaN(video.duration)) {
        await new Promise((r) =>
          video.addEventListener("loadedmetadata", r, { once: true })
        );
      }
      this.strobe.resize(video.videoWidth, video.videoHeight);

      const dur = video.duration;
      let count = Math.round((dur * 1000) / intervalMs) || 2;
      count = Math.max(2, Math.min(MAX_FRAMES, count));

      // --- 1. Capturar frames ---
      this.frames = [];
      for (let i = 0; i < count; i++) {
        const t = ((i + 0.5) * dur) / count;
        await seekTo(video, t);
        this.frames.push(this._grab());
        this.onProgress("collecting", (i + 1) / count);
        await yieldToUI();
      }

      // --- 2. Modelo de fondo (mediana de un subconjunto) ---
      this.onProgress("modeling", 0);
      const step = Math.max(1, Math.floor(this.frames.length / MAX_BG_SAMPLES));
      const bgFrames = this.frames.filter((_, i) => i % step === 0);
      this.strobe.setBackground(bgFrames);
      await yieldToUI();

      // --- 3. Componer ---
      await this.recompose();
    } finally {
      this.busy = false;
    }
  }

  /** Recompone el estrobo desde los frames cacheados (parámetros nuevos). */
  async recompose() {
    if (!this.strobe.ready || !this.hasFrames) return;
    this.strobe.resetAccumulator();
    const total = this.frames.length;
    for (let i = 0; i < total; i++) {
      const frame = this.frames[i];
      const alpha = this.strobe.maskFrame(frame);
      this.strobe.composite(frame, alpha);
      this.strobe.flush();
      this.onProgress("compositing", (i + 1) / total);
      await yieldToUI();
    }
    this.onProgress("done", 1);
  }
}
