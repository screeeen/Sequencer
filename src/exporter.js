// Export del strobo a los tamaños de Instagram, con la calidad como
// prioridad: se compone SIEMPRE a la resolución del preset (nunca desde el
// canvas en pantalla), reescalado en dos pasos si se reduce a menos de la
// mitad (evita aliasing) y PNG como formato (Instagram ya recomprime).

export const PRESETS = {
  original: null,
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

/** drawImage con reducción en dos pasos cuando el factor baja de 0.5. */
function drawScaled(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (dw / sw >= 0.5) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  const mid = document.createElement("canvas");
  mid.width = Math.max(1, Math.round(sw / 2));
  mid.height = Math.max(1, Math.round(sh / 2));
  const mctx = mid.getContext("2d");
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(src, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
  drawScaled(ctx, mid, 0, 0, mid.width, mid.height, dx, dy, dw, dh);
}

/** Estampa el crédito en la esquina inferior derecha, legible sobre todo. */
function stampCredit(ctx, W, H, text) {
  const size = Math.round(H * 0.022);
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = size / 3;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, W - W * 0.03, H - H * 0.03);
  ctx.shadowBlur = 0;
}

/**
 * Compone el export final. Síncrono a propósito: el guardado en iOS debe
 * ocurrir dentro del gesto del usuario.
 *
 * @param {HTMLCanvasElement} src  canvas del strobo (resolución de trabajo)
 * @param {{preset: {w,h}|null, mode: "fill"|"fit",
 *          offset: {x,y}, credit: string}} opts
 *   offset (0..1): encuadre en fill; 0.5/0.5 = centrado.
 * @returns {HTMLCanvasElement}
 */
export function exportImage(src, { preset = null, mode = "fill", offset = { x: 0.5, y: 0.5 }, credit = "" } = {}) {
  const sw = src.width;
  const sh = src.height;
  const out = document.createElement("canvas");

  if (!preset) {
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext("2d");
    ctx.drawImage(src, 0, 0);
    if (credit) stampCredit(ctx, sw, sh, credit);
    return out;
  }

  const { w: W, h: H } = preset;
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (mode === "fit") {
    // Bandas: el propio strobo a cubrir, desenfocado y velado (fallback
    // blanco donde ctx.filter no existe, Safari < 16).
    if ("filter" in ctx) {
      const cover = Math.max(W / sw, H / sh);
      const cw = sw * cover;
      const ch = sh * cover;
      ctx.filter = `blur(${Math.round(Math.max(W, H) * 0.025)}px)`;
      ctx.drawImage(src, (W - cw) / 2, (H - ch) / 2, cw, ch);
      ctx.filter = "none";
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
    }
    const s = Math.min(W / sw, H / sh);
    const dw = Math.round(sw * s);
    const dh = Math.round(sh * s);
    drawScaled(ctx, src, 0, 0, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    // fill: la ventana visible del origen según el offset de encuadre.
    const s = Math.max(W / sw, H / sh);
    const vw = W / s;
    const vh = H / s;
    const sx = (sw - vw) * offset.x;
    const sy = (sh - vh) * offset.y;
    drawScaled(ctx, src, sx, sy, vw, vh, 0, 0, W, H);
  }

  if (credit) stampCredit(ctx, W, H, credit);
  return out;
}
