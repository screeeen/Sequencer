// Carga del vídeo. El muestreo de frames lo hace el pipeline por seeking,
// así que aquí solo gestionamos la fuente y el archivo seleccionado.

export class VideoSource {
  /**
   * @param {HTMLVideoElement} video
   */
  constructor(video) {
    this.video = video;
    this.intervalMs = 100; // separación objetivo entre capturas
  }

  /** Carga un archivo local seleccionado por el usuario. */
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
}
