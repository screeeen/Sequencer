export class VideoSource {
  constructor(video) {
    this.video = video;
    this.intervalMs = 100; // tiempo mínimo entre frames muestreados
    this.lastSample = -Infinity;
    this._frameHandle = null;

    this.onMetadata = () => {}; // (width, height)
    this.onFirstFrame = () => {}; // (video) -> capturar fondo
    this.onSample = () => {}; // (video) -> acumular frame

    this._supportsRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

    this.video.addEventListener("loadedmetadata", () => {
      this.onMetadata(this.video.videoWidth, this.video.videoHeight);
    });

    this.video.addEventListener("play", () => this._start());
    this.video.addEventListener("pause", () => this._stop());
    this.video.addEventListener("ended", () => this._stop());
  }

  loadFile(file) {
    if (this.video.src && this.video.src.startsWith("blob:")) {
      URL.revokeObjectURL(this.video.src);
    }
    this.video.src = URL.createObjectURL(file);
    this.video.load();
  }

  setInterval(ms) {
    this.intervalMs = ms;
  }

  _start() {
    this.lastSample = -Infinity;
    if (this._supportsRVFC) {
      this._scheduleRVFC();
    } else {
      this._tick(); // fallback para navegadores sin rVFC
    }
  }

  _stop() {
    if (this._frameHandle !== null) {
      if (this._supportsRVFC) {
        this.video.cancelVideoFrameCallback(this._frameHandle);
      } else {
        clearTimeout(this._frameHandle);
      }
      this._frameHandle = null;
    }
  }

  _scheduleRVFC() {
    this._frameHandle = this.video.requestVideoFrameCallback(() => {
      this._process();
      if (!this.video.paused && !this.video.ended) this._scheduleRVFC();
    });
  }

  _tick() {
    if (this.video.paused || this.video.ended) return;
    this._process();
    this._frameHandle = setTimeout(() => this._tick(), this.intervalMs);
  }

  _process() {
    const tMs = this.video.currentTime * 1000;

    // Primer frame de la reproducción: sirve de fondo.
    if (this.lastSample === -Infinity) {
      this.onFirstFrame(this.video);
      this.lastSample = tMs;
      return;
    }

    if (tMs - this.lastSample >= this.intervalMs) {
      this.onSample(this.video);
      this.lastSample = tMs;
    }
  }
}
