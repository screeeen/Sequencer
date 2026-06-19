// Primitivas de procesado de imagen sobre typed arrays.
//
// Trabajamos con dos representaciones:
//  - RGBA: Uint8ClampedArray de ImageData (4 bytes por píxel).
//  - máscara: Uint8Array de 1 canal (0..255), un valor por píxel.

/** Convierte RGBA -> {y, cb, cr} (canales separados, Float32, BT.601). */
export function rgbaToYCbCr(rgba, width, height) {
  const n = width * height;
  const y = new Float32Array(n);
  const cb = new Float32Array(n);
  const cr = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  }
  return { y, cb, cr };
}

/** Mediana del valor absoluto de las desviaciones (robusta al ruido). */
function medianOf(values, count) {
  // Inserción simple; count es pequeño (nº de frames de muestra).
  const arr = values.slice(0, count).sort((a, b) => a - b);
  const m = arr.length >> 1;
  return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
}

/**
 * Modelo de fondo robusto a partir de varios frames de la misma escena fija.
 * Devuelve el fondo en RGBA (mediana por canal) y un mapa de ruido por píxel
 * (MAD de la luma) para umbralización adaptativa.
 *
 * @param {ImageData[]} frames
 */
export function buildBackgroundModel(frames, width, height) {
  const n = width * height;
  const k = frames.length;
  const bg = new Uint8ClampedArray(n * 4);
  const noise = new Float32Array(n); // MAD de luma por píxel

  const rs = new Float32Array(k);
  const gs = new Float32Array(k);
  const bs = new Float32Array(k);
  const ls = new Float32Array(k);
  const dev = new Float32Array(k);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    for (let f = 0; f < k; f++) {
      const d = frames[f].data;
      const r = d[p];
      const g = d[p + 1];
      const b = d[p + 2];
      rs[f] = r;
      gs[f] = g;
      bs[f] = b;
      ls[f] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const mr = medianOf(rs, k);
    const mg = medianOf(gs, k);
    const mb = medianOf(bs, k);
    const ml = medianOf(ls, k);
    bg[p] = mr;
    bg[p + 1] = mg;
    bg[p + 2] = mb;
    bg[p + 3] = 255;
    for (let f = 0; f < k; f++) dev[f] = Math.abs(ls[f] - ml);
    noise[i] = medianOf(dev, k);
  }
  return { bg, noise };
}

/** Erosión binaria 3x3 (mínimo del vecindario). Mantiene 0/255. */
export function erode(mask, width, height, out) {
  out = out || new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let on = 255;
      for (let dy = -1; dy <= 1 && on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx] === 0) {
            on = 0;
            break;
          }
        }
      }
      out[i] = on;
    }
  }
  return out;
}

/** Dilatación binaria 3x3 (máximo del vecindario). */
export function dilate(mask, width, height, out) {
  out = out || new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx] !== 0) {
            on = 255;
            break;
          }
        }
      }
      out[i] = on;
    }
  }
  return out;
}

/** Apertura (quita motas) seguida de cierre (rellena huecos). */
export function openClose(mask, width, height, iterations = 1) {
  let a = mask;
  let b = new Uint8Array(mask.length);
  for (let it = 0; it < iterations; it++) {
    erode(a, width, height, b);
    [a, b] = [b, a];
    dilate(a, width, height, b);
    [a, b] = [b, a];
  }
  for (let it = 0; it < iterations; it++) {
    dilate(a, width, height, b);
    [a, b] = [b, a];
    erode(a, width, height, b);
    [a, b] = [b, a];
  }
  return a;
}

/**
 * Limpieza de blobs (4-conectividad): conserva solo las regiones relevantes
 * del sujeto y borra el resto. Un blob se conserva si su área supera minArea Y
 * además es >= fracOfLargest del blob mayor (elimina ruido disperso de tamaño
 * medio que de otro modo crearía un "overlay"). Modifica la máscara in situ.
 */
export function keepMainBlobs(mask, width, height, minArea, fracOfLargest = 0.15) {
  const n = width * height;
  const labels = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const areaByLabel = new Map();

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = start;
    let area = 0;
    while (head < tail) {
      const i = queue[head++];
      area++;
      const x = i % width;
      const y = (i / width) | 0;
      if (x > 0) {
        const j = i - 1;
        if (mask[j] !== 0 && labels[j] === -1) (labels[j] = start), (queue[tail++] = j);
      }
      if (x < width - 1) {
        const j = i + 1;
        if (mask[j] !== 0 && labels[j] === -1) (labels[j] = start), (queue[tail++] = j);
      }
      if (y > 0) {
        const j = i - width;
        if (mask[j] !== 0 && labels[j] === -1) (labels[j] = start), (queue[tail++] = j);
      }
      if (y < height - 1) {
        const j = i + width;
        if (mask[j] !== 0 && labels[j] === -1) (labels[j] = start), (queue[tail++] = j);
      }
    }
    areaByLabel.set(start, area);
  }

  let largest = 0;
  for (const a of areaByLabel.values()) if (a > largest) largest = a;
  const threshold = Math.max(minArea, largest * fracOfLargest);

  for (let i = 0; i < n; i++) {
    if (mask[i] !== 0 && areaByLabel.get(labels[i]) < threshold) mask[i] = 0;
  }
  return mask;
}

/**
 * Difumina la máscara binaria a alpha suave (0..255) con un box blur
 * separable de radio r — da el "feather" del borde y antialiasing.
 */
export function feather(mask, width, height, radius = 1) {
  const n = width * height;
  const tmp = new Float32Array(n);
  const out = new Uint8ClampedArray(n);
  const win = radius * 2 + 1;

  // Horizontal.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += mask[row + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      const add = Math.min(width - 1, x + radius + 1);
      const sub = Math.max(0, x - radius);
      sum += mask[row + add] - mask[row + sub];
    }
  }
  // Vertical.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / win;
      const add = Math.min(height - 1, y + radius + 1);
      const sub = Math.max(0, y - radius);
      sum += tmp[add * width + x] - tmp[sub * width + x];
    }
  }
  return out;
}
