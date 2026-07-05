// Graba el canvas de Result mientras el pipeline compone el strobo: el vídeo
// resultante es exactamente lo que ve el usuario cuando las siluetas se van
// pintando una a una. El último blob queda en un buffer (r.blob) listo para
// compartir/guardar; cada recomposición lo reemplaza.
//
// MediaRecorder + canvas.captureStream. Si el navegador no los soporta, todo
// es no-op silencioso (la app funciona igual, sin vídeo).

const FPS = 30; // techo de muestreo del stream (captura solo en repintados)
const BITRATE = 8_000_000; // el strobo es detalle fino; el default (~2.5M) empasta

// Preferencia de contenedor: MP4/H.264 (Instagram, iOS) antes que WebM.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
];

/**
 * @param {HTMLCanvasElement} canvas  canvas de Result (resolución de trabajo)
 */
export function createRecorder(canvas) {
  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof canvas.captureStream === "function";

  const r = {
    blob: null, // última grabación completa (el "buffer")
    onRecorded: () => {}, // (blob) — la UI habilita "save video"
  };

  let active = null; // { rec, drop } de la grabación en curso

  /** Cierra la grabación en curso; con save=false se descarta sin publicar. */
  const finalize = (save) => {
    if (!active) return;
    const a = active;
    active = null;
    if (!save) a.drop();
    if (a.rec.state !== "inactive") a.rec.stop();
  };

  r.start = () => {
    if (!supported) return;
    finalize(false); // una grabación a medias no vale: la pisa la nueva
    const stream = canvas.captureStream(FPS);
    const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    let rec;
    try {
      rec = new MediaRecorder(
        stream,
        mime
          ? { mimeType: mime, videoBitsPerSecond: BITRATE }
          : { videoBitsPerSecond: BITRATE }
      );
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const chunks = [];
    let keep = true;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (keep && chunks.length) {
        r.blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
        r.onRecorded(r.blob);
      }
    };
    active = { rec, drop: () => (keep = false) };
    rec.start(250); // timeslice: no perder todo si algo interrumpe la pestaña
  };

  /** Cierra la grabación y publica el blob en el buffer (via onRecorded). */
  r.stop = () => finalize(true);

  /** Descarta grabación en curso y buffer (p. ej. al cargar otro vídeo). */
  r.discard = () => {
    finalize(false);
    r.blob = null;
  };

  Object.defineProperty(r, "recording", { get: () => active !== null });

  return r;
}
