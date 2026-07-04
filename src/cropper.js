// Recorte espacial sobre el vídeo: rectángulo con asas en los cuatro BORDES
// (el caso real dominante es quitar bandas de UI de grabaciones de pantalla)
// y arrastre del interior para mover. Estado en coordenadas normalizadas
// (0..1) del frame, independiente del tamaño en pantalla.

const MIN = 0.1; // lado mínimo del recorte (fracción del frame)

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * @param {HTMLElement} box     contenedor que abraza al vídeo (position:relative)
 * @param {HTMLElement} rectEl  el rectángulo de recorte (position:absolute)
 */
export function createCropper(box, rectEl) {
  const c = { x: 0, y: 0, w: 1, h: 1, onChange: () => {} };

  const apply = () => {
    rectEl.style.left = `${c.x * 100}%`;
    rectEl.style.top = `${c.y * 100}%`;
    rectEl.style.width = `${c.w * 100}%`;
    rectEl.style.height = `${c.h * 100}%`;
  };

  Object.defineProperty(c, "isFull", {
    get: () => c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1,
  });

  c.reset = () => {
    c.x = 0;
    c.y = 0;
    c.w = 1;
    c.h = 1;
    apply();
    c.onChange();
  };

  let drag = null;

  rectEl.addEventListener("pointerdown", (e) => {
    drag = {
      edge: e.target.dataset.edge || "move",
      px: e.clientX,
      py: e.clientY,
      x0: c.x,
      y0: c.y,
      w0: c.w,
      h0: c.h,
    };
    rectEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  rectEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const b = box.getBoundingClientRect();
    const dx = (e.clientX - drag.px) / b.width;
    const dy = (e.clientY - drag.py) / b.height;
    const { edge, x0, y0, w0, h0 } = drag;
    if (edge === "move") {
      c.x = clamp(x0 + dx, 0, 1 - w0);
      c.y = clamp(y0 + dy, 0, 1 - h0);
    } else if (edge === "w") {
      c.x = clamp(x0 + dx, 0, x0 + w0 - MIN);
      c.w = w0 + (x0 - c.x);
    } else if (edge === "e") {
      c.w = clamp(w0 + dx, MIN, 1 - x0);
    } else if (edge === "n") {
      c.y = clamp(y0 + dy, 0, y0 + h0 - MIN);
      c.h = h0 + (y0 - c.y);
    } else if (edge === "s") {
      c.h = clamp(h0 + dy, MIN, 1 - y0);
    }
    apply();
  });

  const end = () => {
    if (!drag) return;
    drag = null;
    c.onChange();
  };
  rectEl.addEventListener("pointerup", end);
  rectEl.addEventListener("pointercancel", end);

  apply();
  return c;
}
