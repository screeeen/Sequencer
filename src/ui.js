// Cableado de los controles del DOM con el motor (Strobe) y la fuente de vídeo.

/** Convierte "#rrggbb" a {r,g,b}. */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * @param {object} els  referencias a elementos del DOM
 * @param {import("./video.js").VideoSource} videoSource
 * @param {import("./strobe.js").Strobe} strobe
 */
export function setupUI(els, videoSource, strobe) {
  // --- Cargar vídeo propio ---
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) videoSource.loadFile(file);
  });

  // --- Intervalo entre capturas ---
  const syncInterval = () => {
    const ms = Number(els.intervalInput.value);
    videoSource.setInterval(ms);
    els.intervalLabel.textContent = `${ms} ms`;
  };
  els.intervalInput.addEventListener("input", syncInterval);
  syncInterval();

  // --- Umbral de detección ---
  const syncThreshold = () => {
    const t = Number(els.thresholdInput.value);
    strobe.threshold = t;
    els.thresholdLabel.textContent = String(t);
  };
  els.thresholdInput.addEventListener("input", syncThreshold);
  syncThreshold();

  // --- Resaltado de color ---
  els.highlightToggle.addEventListener("change", () => {
    strobe.highlight = els.highlightToggle.checked;
  });
  els.colorInput.addEventListener("input", () => {
    strobe.color = hexToRgb(els.colorInput.value);
  });
  strobe.color = hexToRgb(els.colorInput.value);

  // --- Reset de la acumulación ---
  els.resetButton.addEventListener("click", () => strobe.reset());

  // --- Guardar PNG (patrón de descarga del original) ---
  els.saveButton.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = strobe.toDataURL();
    a.download = "sequence.png";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // --- Indicador de progreso ---
  const video = videoSource.video;
  const updateProgress = () => {
    if (!video.duration || Number.isNaN(video.duration)) {
      els.progress.textContent = "";
      return;
    }
    const pct = Math.round((video.currentTime / video.duration) * 100);
    els.progress.textContent = video.ended ? "listo" : `${pct}%`;
  };
  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("ended", updateProgress);
}
