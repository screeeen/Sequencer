// Motor del efecto estroboscópico (ingeniería de imagen).
//
// Pipeline de calidad por frame:
//   1. Fondo robusto = mediana temporal de varios frames (buildBackgroundModel).
//   2. Máscara de sujeto = distancia de CROMA al fondo (YCbCr) + diferencia de
//      luma adaptativa al ruido, con supresión de sombras.
//   3. Limpieza espacial: apertura/cierre morfológico + descarte de blobs
//      pequeños + feather del borde -> alpha suave.
//   4. Compositing del sujeto sobre el acumulador con ese alpha (sin costuras).

import {
  rgbaToYCbCr,
  buildBackgroundModel,
  openClose,
  keepMainBlobs,
  feather,
} from "./imageops.js";

const MAX_DIM = 1280; // cota de resolución de trabajo (perf/memoria)

export class Strobe {
  constructor(outputCanvas) {
    this.canvas = outputCanvas;
    this.ctx = outputCanvas.getContext("2d", { willReadFrequently: true });

    this.width = outputCanvas.width;
    this.height = outputCanvas.height;

    this.background = null; // Uint8ClampedArray RGBA (mediana)
    this.bgY = null;
    this.bgCb = null;
    this.bgCr = null;
    this.noise = null; // MAD de luma por píxel
    this.accumulator = null; // ImageData en construcción

    // Parámetros de la UI.
    this.threshold = 30;
    this.highlight = false;
    this.color = { r: 255, g: 0, b: 0 };
  }

  /** Ajusta dimensiones de trabajo a partir de la resolución del vídeo. */
  resize(videoWidth, videoHeight) {
    const scale = Math.min(1, MAX_DIM / Math.max(videoWidth, videoHeight));
    this.width = Math.round(videoWidth * scale) || 1;
    this.height = Math.round(videoHeight * scale) || 1;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.background = null;
  }

  get ready() {
    return this.background !== null;
  }

  /** Construye el modelo de fondo (mediana + ruido) a partir de N frames. */
  setBackground(frames) {
    const { bg, noise } = buildBackgroundModel(frames, this.width, this.height);
    this.background = bg;
    this.noise = noise;
    const { y, cb, cr } = rgbaToYCbCr(bg, this.width, this.height);
    this.bgY = y;
    this.bgCb = cb;
    this.bgCr = cr;
    let sum = 0;
    for (let i = 0; i < y.length; i++) sum += y[i];
    this.bgMeanY = sum / y.length;
    this.resetAccumulator();
  }

  /** Reinicia el acumulador a una copia del fondo y lo pinta. */
  resetAccumulator() {
    if (!this.ready) return;
    this.accumulator = new ImageData(
      new Uint8ClampedArray(this.background),
      this.width,
      this.height
    );
    this.flush();
  }

  /**
   * Calcula la máscara alpha (0..255) del sujeto para un frame dado.
   * @param {ImageData} frame
   * @returns {Uint8ClampedArray} alpha por píxel
   */
  maskFrame(frame) {
    const w = this.width;
    const h = this.height;
    const n = w * h;
    const { y, cb, cr } = rgbaToYCbCr(frame.data, w, h);
    const raw = new Uint8Array(n);

    // Normalización de iluminación: escala la luma del frame para igualar el
    // brillo medio del fondo. Neutraliza la auto-exposición/parpadeo, que si no
    // dispara grandes zonas como sujeto (el efecto "overlay"). Acotada.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += y[i];
    const meanY = sum / n;
    const gain = Math.min(1.4, Math.max(0.7, this.bgMeanY / Math.max(meanY, 1)));

    const Tc = this.threshold; // umbral de croma
    for (let i = 0; i < n; i++) {
      const dCb = cb[i] - this.bgCb[i];
      const dCr = cr[i] - this.bgCr[i];
      const dC = Math.sqrt(dCb * dCb + dCr * dCr);
      const yn = y[i] * gain;
      const dY = yn - this.bgY[i];
      const Ty = Math.max(Tc * 1.2, 4 * this.noise[i] + 6);

      let fg = false;
      if (dC > Tc) {
        fg = true; // cambio de color claro
      } else if (Math.abs(dY) > Ty) {
        // Cambio de brillo con croma similar: sujeto gris sobre fondo gris,
        // salvo que sea una sombra (algo más oscuro, mismo color). Banda
        // estrecha para no comerse sujetos genuinamente oscuros.
        const ratio = yn / Math.max(this.bgY[i], 1);
        const isShadow = dY < 0 && ratio > 0.5 && ratio < 0.95;
        fg = !isShadow;
      }
      raw[i] = fg ? 255 : 0;
    }

    const cleaned = openClose(raw, w, h, 1);
    const minArea = Math.max(40, Math.round(n * 0.0006));
    keepMainBlobs(cleaned, w, h, minArea, 0.15);
    const radius = Math.max(1, Math.round(Math.min(w, h) / 400));
    return feather(cleaned, w, h, radius);
  }

  /** Compone un frame sobre el acumulador usando el alpha dado. */
  composite(frame, alpha) {
    const acc = this.accumulator.data;
    const src = frame.data;
    const hr = this.color.r;
    const hg = this.color.g;
    const hb = this.color.b;
    const useHighlight = this.highlight;
    for (let i = 0; i < alpha.length; i++) {
      const a = alpha[i] / 255;
      if (a === 0) continue;
      const p = i * 4;
      const tr = useHighlight ? hr : src[p];
      const tg = useHighlight ? hg : src[p + 1];
      const tb = useHighlight ? hb : src[p + 2];
      acc[p] = acc[p] * (1 - a) + tr * a;
      acc[p + 1] = acc[p + 1] * (1 - a) + tg * a;
      acc[p + 2] = acc[p + 2] * (1 - a) + tb * a;
      acc[p + 3] = 255;
    }
  }

  /** Vuelca el acumulador al canvas visible. */
  flush() {
    this.ctx.putImageData(this.accumulator, 0, 0);
  }

  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}
