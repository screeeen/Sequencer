// Cableado de los controles del DOM con el motor (Strobe), el cargador de
// vídeo y el pipeline de generación. Cada bloque conecta un control con su
// efecto y, cuando procede, dispara una recomposición desde la caché.

/** Convierte un color "#rrggbb" a un objeto {r, g, b} (0..255). */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Convierte una data URL (base64) en un Blob de forma SÍNCRONA. Necesario para
 * compartir/guardar dentro del gesto del usuario en iOS (toBlob es asíncrono y
 * perdería la "activación" requerida por navigator.share).
 */
function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Etiquetas de cada fase del pipeline para el indicador de progreso.
const PHASE_LABEL = {
  collecting: "capturing",
  modeling: "background…",
  compositing: "compositing",
  done: "done",
};

/**
 * Conecta todos los controles de la UI con la lógica.
 * @param {object} els  referencias a los elementos del DOM
 * @param {ReturnType<import("./video.js").createVideoSource>} videoSource
 * @param {ReturnType<import("./strobe.js").createStrobe>} strobe
 * @param {ReturnType<import("./pipeline.js").createPipeline>} pipeline
 */
export function setupUI(els, videoSource, strobe, pipeline) {
  // Indicador de progreso: traduce (fase, fracción) del pipeline a texto.
  pipeline.onProgress = (phase, fraction) => {
    const label = PHASE_LABEL[phase] || phase;
    const pct = Math.round(fraction * 100);
    els.progress.textContent =
      phase === "modeling" || phase === "done" ? label : `${label} ${pct}%`;
  };

  // Recompone desde la caché con un pequeño retardo (debounce), para no
  // recalcular en cada pixel mientras se arrastra un slider.
  let recomposeTimer = null;
  const scheduleRecompose = () => {
    if (!pipeline.hasFrames) return;
    clearTimeout(recomposeTimer);
    recomposeTimer = setTimeout(() => {
      if (!pipeline.busy) pipeline.recompose();
    }, 150);
  };

  // Cargar un vídeo propio: carga la fuente y vacía la caché de frames.
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) {
      videoSource.loadFile(file);
      pipeline.clear();
      els.progress.textContent = "";
    }
  });

  // INTERVAL: separación entre las copias del sujeto. No recaptura; submuestrea
  // la caché por tiempo y recompone (más ms = menos copias, más espaciadas).
  const syncInterval = () => {
    const ms = Number(els.intervalInput.value);
    videoSource.setInterval(ms);
    pipeline.setInterval(ms);
    els.intervalLabel.textContent = `${ms} ms`;
  };
  els.intervalInput.addEventListener("input", () => {
    syncInterval();
    scheduleRecompose();
  });
  syncInterval();

  // THRESHOLD: sensibilidad de detección (en sigmas). Más bajo = más sujeto
  // (y ruido); más alto = más estricto y limpio. Recompone en vivo.
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

  // HIGHLIGHT SUBJECT: pinta el sujeto detectado con un color sólido en lugar
  // de sus píxeles reales (toggle + selector de color).
  els.highlightToggle.addEventListener("change", () => {
    strobe.highlight = els.highlightToggle.checked;
    scheduleRecompose();
  });
  els.colorInput.addEventListener("input", () => {
    strobe.color = hexToRgb(els.colorInput.value);
    scheduleRecompose();
  });
  strobe.color = hexToRgb(els.colorInput.value);

  // PLAY: reproduce el vídeo; el pipeline captura durante la reproducción y
  // compone al terminar (funciona en iOS gracias al gesto del usuario +
  // playsinline). Si el navegador bloquea play(), avisamos.
  els.playButton.addEventListener("click", () => {
    if (pipeline.busy) return;
    els.progress.textContent = "capturing 0%";
    const p = videoSource.video.play();
    if (p && p.catch) p.catch(() => (els.progress.textContent = "tap play ▶"));
  });

  // RESET: descarta la acumulación y vuelve al fondo limpio.
  els.resetButton.addEventListener("click", () => strobe.resetAccumulator());

  // SAVE PICTURE: en iOS abre la hoja de compartir (-> "Guardar imagen" en
  // Fotos) vía Web Share API; en el resto, descarga el PNG.
  els.saveButton.addEventListener("click", () => {
    if (!strobe.ready) return;
    const blob = dataURLtoBlob(strobe.toDataURL());
    const file = new File([blob], "sequence.png", { type: "image/png" });

    // navigator.share debe llamarse dentro del gesto -> nada async antes.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "strobe" }).catch(() => {});
      return;
    }

    // Fallback (escritorio): descarga clásica.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sequence.png";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
