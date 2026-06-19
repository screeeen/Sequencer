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
    this.frames = []; // ImageData[] capturados durante la reproducción
    this.intervalMs = 100;
    this.busy = false;
    this.onProgress = () => {}; // (phase, fraction)

    this._supportsRVFC =
      "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    this._effInterval = this.intervalMs;
    this._lastMs = -Infinity;

    this.video.addEventListener("play", () => this._onPlay());
    this.video.addEventListener("ended", () => this._onEnded());
  }

  get hasFrames() {
    return this.frames.length > 0;
  }

  setInterval(ms) {
    this.intervalMs = ms;
  }

  /** Captura el frame actual del vídeo a la resolución de trabajo del estrobo. */
  _grab() {
    const w = this.strobe.width;
    const h = this.strobe.height;
    if (this.capture.width !== w) this.capture.width = w;
    if (this.capture.height !== h) this.capture.height = h;
    this.captureCtx.drawImage(this.video, 0, 0, w, h);
    return this.captureCtx.getImageData(0, 0, w, h);
  }

  // --- Captura durante la reproducción ---

  _onPlay() {
    if (this.busy) return;
    const video = this.video;
    // Asegura resolución de trabajo y reinicia la captura.
    if (video.videoWidth) this.strobe.resize(video.videoWidth, video.videoHeight);
    this.frames = [];
    this._lastMs = -Infinity;

    const durMs = (video.duration || 0) * 1000;
    // Espaciado efectivo: respeta el pedido pero garantiza <= MAX_FRAMES.
    this._effInterval = durMs
      ? Math.max(this.intervalMs, durMs / MAX_FRAMES)
      : this.intervalMs;

    if (this._supportsRVFC) this._rvfcLoop();
    else this._timeoutLoop();
  }

  _rvfcLoop() {
    this.video.requestVideoFrameCallback(() => {
      this._maybeCapture();
      if (!this.video.paused && !this.video.ended) this._rvfcLoop();
    });
  }

  _timeoutLoop() {
    if (this.video.paused || this.video.ended) return;
    this._maybeCapture();
    setTimeout(() => this._timeoutLoop(), 30);
  }

  _maybeCapture() {
    if (this.frames.length >= MAX_FRAMES) return;
    const video = this.video;
    if (!video.videoWidth) return;
    const tMs = video.currentTime * 1000;
    if (this.frames.length === 0 || tMs - this._lastMs >= this._effInterval) {
      this.frames.push(this._grab());
      this._lastMs = tMs;
      const frac = video.duration ? video.currentTime / video.duration : 0;
      this.onProgress("capturing", Math.min(1, frac));
    }
  }

  async _onEnded() {
    if (this.busy || this.frames.length < 2) return;
    this.busy = true;
    try {
      // --- Modelo de fondo (mediana de un subconjunto) ---
      this.onProgress("modeling", 0);
      await yieldToUI();
      const step = Math.max(1, Math.floor(this.frames.length / MAX_BG_SAMPLES));
      const bgFrames = this.frames.filter((_, i) => i % step === 0);
      this.strobe.setBackground(bgFrames);
      await yieldToUI();

      // --- Componer ---
      await this._composeAll();
    } finally {
      this.busy = false;
    }
  }

  /** Recompone el estrobo desde los frames cacheados (parámetros nuevos). */
  async recompose() {
    if (this.busy || !this.strobe.ready || !this.hasFrames) return;
    this.busy = true;
    try {
      await this._composeAll();
    } finally {
      this.busy = false;
    }
  }

  async _composeAll() {
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
