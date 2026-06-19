// Carga del vídeo. El muestreo de frames lo hace el pipeline durante la
// reproducción, así que aquí solo gestionamos la fuente y el archivo.

/**
 * @param {HTMLVideoElement} video
 */
export function createVideoSource(video) {
  const source = {
    video,
    intervalMs: 100, // separación objetivo entre capturas
  };

  /** Carga un archivo local seleccionado por el usuario. */
  source.loadFile = (file) => {
    if (video.src && video.src.startsWith("blob:")) {
      URL.revokeObjectURL(video.src);
    }
    video.src = URL.createObjectURL(file);
    video.load();
  };

  source.setInterval = (ms) => {
    source.intervalMs = ms;
  };

  return source;
}
