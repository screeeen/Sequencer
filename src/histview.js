// Vista del análisis de auto-threshold: pinta en un canvas el histograma de
// scores (escala log, porque el fondo domina en varios órdenes de magnitud) y
// el corte elegido por Otsu, más un resumen textual con los datos.

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} statsEl
 * @param {{hist: Uint32Array, cutSigma: number, sigmaMax: number,
 *          threshold: number, sampleCount: number}} a
 */
export function renderAnalysis(canvas, statsEl, a) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const PAD_B = 22; // hueco inferior para las etiquetas del eje
  ctx.clearRect(0, 0, W, H);

  const bins = a.hist.length;
  const cutBin = Math.round((a.cutSigma / a.sigmaMax) * bins);
  let max = 0;
  let total = 0;
  let above = 0;
  for (let i = 0; i < bins; i++) {
    const c = a.hist[i];
    total += c;
    if (c > max) max = c;
    if (i >= cutBin) above += c;
  }
  if (!total) return;

  // Barras: claras = clasificado como fondo, oscuras = sujeto (según el corte).
  const logMax = Math.log1p(max);
  const bw = W / bins;
  for (let i = 0; i < bins; i++) {
    if (!a.hist[i]) continue;
    const h = (Math.log1p(a.hist[i]) / logMax) * (H - PAD_B);
    ctx.fillStyle = i >= cutBin ? "#444" : "#ccc";
    ctx.fillRect(i * bw, H - PAD_B - h, Math.ceil(bw), h);
  }

  // Eje X en sigmas, una marca cada 4.
  ctx.fillStyle = "#999";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (let s = 0; s <= a.sigmaMax; s += 4) {
    const x = Math.min(W - 14, Math.max(14, (s / a.sigmaMax) * W));
    ctx.fillText(`${s}σ`, x, H - 6);
  }

  // Línea de corte de Otsu.
  const cutX = (a.cutSigma / a.sigmaMax) * W;
  ctx.strokeStyle = "#c0392b";
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(cutX, 0);
  ctx.lineTo(cutX, H - PAD_B);
  ctx.stroke();
  ctx.setLineDash([]);

  const clamped = a.threshold !== Math.round(a.cutSigma * 8);
  const pct = ((100 * above) / total).toFixed(1);
  statsEl.textContent =
    `Otsu cut at ${a.cutSigma.toFixed(1)}σ → threshold ${a.threshold}` +
    `${clamped ? " (clamped)" : ""} · ${a.sampleCount} frames analyzed · ` +
    `${pct}% of pixels above the cut`;
}
