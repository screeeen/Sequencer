// Cableado de los controles del DOM con el motor (Strobe), el cargador de
// vídeo y el pipeline de generación.

/** Convierte "#rrggbb" a {r,g,b}. */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const PHASE_LABEL = {
  collecting: "capturing",
  modeling: "background…",
  compositing: "compositing",
  done: "done",
};

/**
 * @param {object} els
 * @param {import("./video.js").VideoSource} videoSource
 * @param {import("./strobe.js").Strobe} strobe
 * @param {import("./pipeline.js").Pipeline} pipeline
 */
export function setupUI(els, videoSource, strobe, pipeline) {
  // --- Progreso ---
  pipeline.onProgress = (phase, fraction) => {
    const label = PHASE_LABEL[phase] || phase;
    const pct = Math.round(fraction * 100);
    els.progress.textContent =
      phase === "modeling" || phase === "done" ? label : `${label} ${pct}%`;
  };

  // --- Recomposición diferida al cambiar parámetros ---
  let recomposeTimer = null;
  const scheduleRecompose = () => {
    if (!pipeline.hasFrames) return;
    clearTimeout(recomposeTimer);
    recomposeTimer = setTimeout(() => {
      if (!pipeline.busy) pipeline.recompose();
    }, 150);
  };

  // --- Cargar vídeo propio ---
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) {
      videoSource.loadFile(file);
      pipeline.frames = [];
      els.progress.textContent = "";
    }
  });

  // --- Intervalo (nº de capturas): se aplica al reproducir con Play) ---
  const syncInterval = () => {
    const ms = Number(els.intervalInput.value);
    videoSource.setInterval(ms);
    pipeline.setInterval(ms);
    els.intervalLabel.textContent = `${ms} ms`;
  };
  els.intervalInput.addEventListener("input", syncInterval);
  syncInterval();

  // --- Umbral de detección (recompone en vivo) ---
  const syncThreshold = () => {
    const t = Number(els.thresholdInput.value);
    strobe.threshold = t;
    els.thresholdLabel.textContent = String(t);
  };
  els.thresholdInput.addEventListener("input", () => {
    syncThreshold();
    scheduleRecompose();
  });
  syncThreshold();

  // --- Resaltado de color ---
  els.highlightToggle.addEventListener("change", () => {
    strobe.highlight = els.highlightToggle.checked;
    scheduleRecompose();
  });
  els.colorInput.addEventListener("input", () => {
    strobe.color = hexToRgb(els.colorInput.value);
    scheduleRecompose();
  });
  strobe.color = hexToRgb(els.colorInput.value);

  // --- Play: reproduce el vídeo; el pipeline captura durante la reproducción
  // y compone al terminar (funciona en iOS gracias al gesto + playsinline) ---
  els.playButton.addEventListener("click", () => {
    if (pipeline.busy) return;
    els.progress.textContent = "capturing 0%";
    const p = videoSource.video.play();
    if (p && p.catch) p.catch(() => (els.progress.textContent = "tap play ▶"));
  });

  // --- Reset: vuelve al fondo limpio ---
  els.resetButton.addEventListener("click", () => strobe.resetAccumulator());

  // --- Guardar PNG ---
  els.saveButton.addEventListener("click", () => {
    if (!strobe.ready) return;
    const a = document.createElement("a");
    a.href = strobe.toDataURL();
    a.download = "sequence.png";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}
