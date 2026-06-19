// Motor del efecto estroboscópico (ingeniería de imagen).
//
// Pipeline de calidad por frame:
//   1. Fondo robusto = mediana temporal por canal (YCbCr) + sigma robusto (MAD).
//   2. Máscara de sujeto:
//        - score estadístico (Mahalanobis diagonal) normalizado por canal,
//        - + pista de MOVIMIENTO inter-frame (3 frames) para no perder al
//          sujeto cuando coincide con el fondo,
//        - + supresión de sombras,
//        - normalización de iluminación (anti-parpadeo).
//   3. Limpieza: morfología open/close + descarte de blobs + GUIDED FILTER que
//      pega el alpha a los bordes reales (siluetas nítidas, sin halos).
//   4. Compositing en LUZ LINEAL con el alpha suave (sin fringing).

import {
  rgbaToYCbCr,
  rgbaToLuma,
  buildBackgroundModel,
  openClose,
  keepMainBlobs,
  guidedFilter,
} from "./imageops.js";

const MAX_DIM = 1280; // cota de resolución de trabajo (perf/memoria)

// LUT sRGB -> lineal y función inversa, para mezclar en luz lineal.
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
}

/**
 * Crea un motor de estrobo sobre un canvas de salida.
 * @param {HTMLCanvasElement} outputCanvas
 */
export function createStrobe(outputCanvas) {
  const ctx = outputCanvas.getContext("2d", { willReadFrequently: true });

  const s = {
    canvas: outputCanvas,
    width: outputCanvas.width,
    height: outputCanvas.height,
    background: null, // Uint8ClampedArray RGBA (mediana) — base del resultado
    mY: null,
    mCb: null,
    mCr: null, // medianas por canal (YCbCr)
    sY: null,
    sCb: null,
    sCr: null, // sigma robusto por canal
    bgMeanY: 0,
    lumaNoise: 0, // sigma de luma medio (umbral de movimiento)
    accumulator: null,
    threshold: 30,
    highlight: false,
    color: { r: 255, g: 0, b: 0 },
  };

  s.resize = (videoWidth, videoHeight) => {
    const scale = Math.min(1, MAX_DIM / Math.max(videoWidth, videoHeight));
    s.width = Math.round(videoWidth * scale) || 1;
    s.height = Math.round(videoHeight * scale) || 1;
    s.canvas.width = s.width;
    s.canvas.height = s.height;
    s.background = null;
  };

  s.setBackground = (frames) => {
    const m = buildBackgroundModel(frames, s.width, s.height);
    s.background = m.bg;
    s.mY = m.mY;
    s.mCb = m.mCb;
    s.mCr = m.mCr;
    s.sY = m.sY;
    s.sCb = m.sCb;
    s.sCr = m.sCr;
    let sumY = 0;
    let sumS = 0;
    for (let i = 0; i < m.mY.length; i++) {
      sumY += m.mY[i];
      sumS += m.sY[i];
    }
    s.bgMeanY = sumY / m.mY.length;
    s.lumaNoise = sumS / m.mY.length;
    s.resetAccumulator();
  };

  s.resetAccumulator = () => {
    if (!s.ready) return;
    s.accumulator = new ImageData(
      new Uint8ClampedArray(s.background),
      s.width,
      s.height
    );
    s.flush();
  };

  /**
   * Máscara alpha (0..255) del sujeto. `prev`/`next` (ImageData vecinos) son
   * opcionales y habilitan la pista de movimiento.
   */
  s.maskFrame = (frame, prev, next) => {
    const w = s.width;
    const h = s.height;
    const n = w * h;
    const { y, cb, cr } = rgbaToYCbCr(frame.data, w, h);
    const prevY = prev ? rgbaToLuma(prev.data, n) : null;
    const nextY = next ? rgbaToLuma(next.data, n) : null;
    const raw = new Uint8Array(n);

    // Normalización de iluminación (anti auto-exposición/parpadeo).
    let sum = 0;
    for (let i = 0; i < n; i++) sum += y[i];
    const meanY = sum / n;
    const gain = Math.min(1.4, Math.max(0.7, s.bgMeanY / Math.max(meanY, 1)));

    const T = s.threshold / 8; // umbral en unidades de sigma (Mahalanobis)
    const motionT = Math.max(10, 4 * s.lumaNoise);
    const FLOOR_Y = 2;
    const FLOOR_C = 2;

    for (let i = 0; i < n; i++) {
      const yn = y[i] * gain;
      const zy = (yn - s.mY[i]) / Math.max(s.sY[i], FLOOR_Y);
      const zcb = (cb[i] - s.mCb[i]) / Math.max(s.sCb[i], FLOOR_C);
      const zcr = (cr[i] - s.mCr[i]) / Math.max(s.sCr[i], FLOOR_C);
      const chromaZ = Math.sqrt(zcb * zcb + zcr * zcr);
      const score = Math.sqrt(zy * zy + zcb * zcb + zcr * zcr);

      let fg = score > T;

      // Supresión de sombras: más oscuro, croma casi sin cambio, ratio moderado.
      if (fg && yn < s.mY[i]) {
        const ratio = yn / Math.max(s.mY[i], 1);
        if (chromaZ < 1.5 && ratio > 0.4 && ratio < 0.95) fg = false;
      }

      // Pista de movimiento: rescata sujetos que coinciden con el fondo.
      if (!fg && prevY && nextY) {
        const dPrev = Math.abs(y[i] - prevY[i]);
        const dNext = Math.abs(y[i] - nextY[i]);
        if (dPrev > motionT && dNext > motionT) fg = true;
      }

      raw[i] = fg ? 255 : 0;
    }

    const cleaned = openClose(raw, w, h, 1);
    const minArea = Math.max(40, Math.round(n * 0.0006));
    keepMainBlobs(cleaned, w, h, minArea, 0.15);

    // Guided filter: alpha pegado a los bordes reales de la imagen.
    const guide = new Float32Array(n);
    const pmask = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      guide[i] = y[i] / 255;
      pmask[i] = cleaned[i] ? 1 : 0;
    }
    const radius = Math.max(2, Math.round(Math.min(w, h) / 200));
    return guidedFilter(guide, pmask, w, h, radius, 1e-3);
  };

  /** Compone un frame sobre el acumulador en luz lineal con el alpha dado. */
  s.composite = (frame, alpha) => {
    const acc = s.accumulator.data;
    const src = frame.data;
    const { r: hr, g: hg, b: hb } = s.color;
    const useHighlight = s.highlight;
    for (let i = 0; i < alpha.length; i++) {
      const a = alpha[i] / 255;
      if (a <= 0.003) continue;
      const p = i * 4;
      const tr = useHighlight ? hr : src[p];
      const tg = useHighlight ? hg : src[p + 1];
      const tb = useHighlight ? hb : src[p + 2];
      acc[p] = linearToSrgb(SRGB_TO_LINEAR[acc[p]] * (1 - a) + SRGB_TO_LINEAR[tr] * a);
      acc[p + 1] = linearToSrgb(SRGB_TO_LINEAR[acc[p + 1]] * (1 - a) + SRGB_TO_LINEAR[tg] * a);
      acc[p + 2] = linearToSrgb(SRGB_TO_LINEAR[acc[p + 2]] * (1 - a) + SRGB_TO_LINEAR[tb] * a);
      acc[p + 3] = 255;
    }
  };

  s.flush = () => ctx.putImageData(s.accumulator, 0, 0);

  s.toDataURL = () => s.canvas.toDataURL("image/png");

  Object.defineProperty(s, "ready", { get: () => s.background !== null });

  return s;
}
