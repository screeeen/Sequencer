// Cableado de los controles del DOM con el motor (Strobe), el cargador de
// vídeo y el pipeline de generación. Cada bloque conecta un control con su
// efecto y, cuando procede, dispara una recomposición desde la caché.

import { renderAnalysis } from "./histview.js";
import { takeShared } from "./sharedb.js";
import { PRESETS, exportImage } from "./exporter.js";

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

/**
 * Entrega un File al usuario: hoja de compartir si el navegador puede
 * (móvil → Instagram), descarga clásica si no. Síncrono: debe llamarse
 * dentro del gesto del usuario (navigator.share lo exige en iOS).
 */
function deliverFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: "strobe" }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Etiquetas de cada fase del pipeline para el indicador de progreso.
const PHASE_LABEL = {
  capturing: "capturing",
  modeling: "background…",
  analyzing: "auto threshold",
  stale: "replay ▶ to apply trim/crop",
  compositing: "compositing",
  done: "done",
};

/**
 * Conecta todos los controles de la UI con la lógica.
 * @param {object} els  referencias a los elementos del DOM
 * @param {ReturnType<import("./video.js").createVideoSource>} videoSource
 * @param {ReturnType<import("./strobe.js").createStrobe>} strobe
 * @param {ReturnType<import("./pipeline.js").createPipeline>} pipeline
 * @param {ReturnType<import("./cropper.js").createCropper>} cropper
 */
export function setupUI(els, videoSource, strobe, pipeline, cropper) {
  // Indicador de progreso: etiqueta + barra. Captura y composición tienen
  // fracción conocida (barra determinada); "modeling" no -> barra indeterminada
  // (animación CSS). Al terminar, la barra se oculta tras una pausa breve.
  let hideTimer = null;
  const hideProgress = () => {
    els.progressRow.hidden = true;
  };
  const setProgress = (phase, fraction) => {
    clearTimeout(hideTimer);
    els.progressRow.hidden = false;
    const indeterminate = phase === "modeling";
    els.progressFill.classList.toggle("indeterminate", indeterminate);
    const label = PHASE_LABEL[phase] || phase;
    if (indeterminate) {
      els.progress.textContent = label;
      els.progressFill.style.width = "";
    } else if (phase === "done" || phase === "stale") {
      els.progress.textContent = label;
      els.progressFill.style.width = phase === "done" ? "100%" : "0%";
    } else {
      const pct = Math.round(fraction * 100);
      els.progress.textContent = `${label} ${pct}%`;
      els.progressFill.style.width = `${pct}%`;
    }
    if (phase === "done") {
      hideTimer = setTimeout(hideProgress, 1500);
      updateFrameMask(); // el canvas puede haber cambiado de tamaño/aspecto
    }
  };
  pipeline.onProgress = setProgress;

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

  // Cargar un vídeo: carga la fuente y vacía la caché de frames. Entrada
  // común del picker y del Web Share Target.
  const loadVideoFile = (file) => {
    videoSource.loadFile(file);
    pipeline.clear();
    pipeline.recorder?.discard(); // el clip de recomposición era de otro vídeo
    els.saveVideoButton.hidden = true;
    clearTimeout(hideTimer);
    hideProgress();
    els.guide.hidden = true;
  };

  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) loadVideoFile(file);
  });

  // Vídeo entrante por "Compartir → Strobo" (Android): el SW lo dejó en
  // IndexedDB y nos redirigió con ?shared=1.
  if (new URLSearchParams(location.search).has("shared")) {
    history.replaceState(null, "", location.pathname);
    takeShared().then((file) => {
      if (file) loadVideoFile(file);
    });
  }

  // INTERVAL: separación entre las copias del sujeto. No recaptura; submuestrea
  // la caché por tiempo y recompone (más ms = menos copias, más espaciadas).
  const syncInterval = () => {
    const ms = Number(els.intervalInput.value);
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

  // El pipeline calcula el threshold óptimo tras cada captura (fase
  // "analyzing"); lo reflejamos en el slider para que se pueda afinar a mano
  // y pintamos el histograma del análisis en el acordeón.
  pipeline.onAutoThreshold = (t, analysis) => {
    els.thresholdInput.value = t;
    syncThreshold();
    if (analysis) renderAnalysis(els.histCanvas, els.histStats, analysis);
  };

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

  // TRIM: solo se capturan frames entre los dos pulgares. Mover un pulgar
  // hace seek de preview e invalida la caché (hay que volver a reproducir).
  const trimLabel = () => {
    const a = Number(els.trimIn.value);
    const b = Number(els.trimOut.value);
    els.trimLabel.textContent = `${a.toFixed(1)}–${b.toFixed(1)}s`;
  };
  const applyTrim = (moved) => {
    let a = Number(els.trimIn.value);
    let b = Number(els.trimOut.value);
    if (b - a < 0.2) {
      // los pulgares no se cruzan
      if (moved === els.trimIn) els.trimIn.value = a = Math.max(0, b - 0.2);
      else els.trimOut.value = b = a + 0.2;
    }
    pipeline.setTrim(a, b);
    els.video.currentTime = moved === els.trimOut ? b : a;
    trimLabel();
    if (pipeline.hasFrames) pipeline.invalidate();
  };
  els.trimIn.addEventListener("input", () => applyTrim(els.trimIn));
  els.trimOut.addEventListener("input", () => applyTrim(els.trimOut));

  // CROP: el rectángulo sobre el vídeo decide qué región se captura.
  els.cropResetBtn.addEventListener("click", () => cropper.reset());
  cropper.onChange = () => {
    els.cropResetBtn.hidden = cropper.isFull;
    if (pipeline.hasFrames) pipeline.invalidate();
  };

  // Al conocer la duración: trim a rango completo y controles visibles.
  els.video.addEventListener("loadedmetadata", () => {
    if (!els.video.videoWidth) return showCodecError();
    const d = els.video.duration || 0;
    els.trimIn.max = els.trimOut.max = d.toFixed(1);
    els.trimIn.value = "0";
    els.trimOut.value = d.toFixed(1);
    pipeline.setTrim(0, d);
    trimLabel();
    els.trimRow.hidden = false;
    els.cropRect.hidden = false;
    cropper.reset();
  });

  // Códecs no soportados (p. ej. HEVC .mov en Chrome Android).
  const showCodecError = () => {
    els.progressRow.hidden = false;
    els.progressFill.classList.remove("indeterminate");
    els.progressFill.style.width = "0%";
    els.progress.textContent = "format not supported — try MP4 (H.264)";
  };
  els.video.addEventListener("error", showCodecError);

  // PLAY: reproduce el vídeo; el pipeline captura durante la reproducción y
  // compone al terminar (funciona en iOS gracias al gesto del usuario +
  // playsinline). Si el navegador bloquea play(), avisamos.
  els.playButton.addEventListener("click", () => {
    if (pipeline.busy) return;
    els.guide.hidden = true;
    setProgress("capturing", 0);
    els.progressRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const p = videoSource.video.play();
    if (p && p.catch)
      p.catch(() => {
        els.progressFill.style.width = "0%";
        els.progress.textContent = "tap play ▶";
      });
  });

  // RESET: descarta la acumulación y vuelve al fondo limpio.
  els.resetButton.addEventListener("click", () => strobe.resetAccumulator());

  // EXPORT: preset de tamaño (Instagram), modo fill/fit, encuadre arrastrable
  // y crédito. Preferencias persistidas; el offset de encuadre es por sesión.
  const exportState = Object.assign(
    { preset: "original", mode: "fill", creditOn: false, credit: "" },
    JSON.parse(localStorage.getItem("strobo.export") || "{}")
  );
  const offset = { x: 0.5, y: 0.5 };
  const saveExportState = () =>
    localStorage.setItem("strobo.export", JSON.stringify(exportState));

  const syncSegmented = (seg, attr, value) => {
    for (const b of seg.querySelectorAll("button")) {
      b.classList.toggle("active", b.dataset[attr] === value);
    }
  };

  // Máscara de encuadre: enseña sobre Result la ventana exacta del preset
  // (solo en fill; en fit entra la imagen entera y no hay nada que encuadrar).
  const updateFrameMask = () => {
    const preset = PRESETS[exportState.preset];
    const show = preset && exportState.mode === "fill";
    els.frameMask.hidden = !show;
    if (!show) return;
    const at = preset.w / preset.h; // aspecto del preset
    const as = strobe.width / strobe.height; // aspecto del strobo
    let w = 100;
    let h = 100;
    let left = 0;
    let top = 0;
    if (at < as) {
      w = (at / as) * 100;
      left = offset.x * (100 - w);
    } else if (at > as) {
      h = (as / at) * 100;
      top = offset.y * (100 - h);
    }
    els.frameMask.style.width = `${w}%`;
    els.frameMask.style.height = `${h}%`;
    els.frameMask.style.left = `${left}%`;
    els.frameMask.style.top = `${top}%`;
  };

  els.presetSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    exportState.preset = b.dataset.preset;
    syncSegmented(els.presetSeg, "preset", exportState.preset);
    els.modeSeg.hidden = exportState.preset === "original";
    saveExportState();
    updateFrameMask();
  });

  els.modeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    exportState.mode = b.dataset.mode;
    syncSegmented(els.modeSeg, "mode", exportState.mode);
    saveExportState();
    updateFrameMask();
  });

  // Arrastre del encuadre (un solo eje tiene holgura según los aspectos).
  let frameDrag = null;
  els.frameMask.addEventListener("pointerdown", (e) => {
    frameDrag = { px: e.clientX, py: e.clientY, x0: offset.x, y0: offset.y };
    els.frameMask.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  els.frameMask.addEventListener("pointermove", (e) => {
    if (!frameDrag) return;
    const preset = PRESETS[exportState.preset];
    if (!preset) return;
    const b = els.resultBox.getBoundingClientRect();
    const at = preset.w / preset.h;
    const as = strobe.width / strobe.height;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    if (at < as) {
      const room = b.width * (1 - at / as);
      if (room > 0) offset.x = clamp01(frameDrag.x0 + (e.clientX - frameDrag.px) / room);
    } else if (at > as) {
      const room = b.height * (1 - as / at);
      if (room > 0) offset.y = clamp01(frameDrag.y0 + (e.clientY - frameDrag.py) / room);
    }
    updateFrameMask();
  });
  const endFrameDrag = () => (frameDrag = null);
  els.frameMask.addEventListener("pointerup", endFrameDrag);
  els.frameMask.addEventListener("pointercancel", endFrameDrag);

  // Crédito.
  els.creditToggle.addEventListener("change", () => {
    exportState.creditOn = els.creditToggle.checked;
    saveExportState();
  });
  els.creditText.addEventListener("input", () => {
    exportState.credit = els.creditText.value.trim();
    saveExportState();
  });

  // Estado inicial desde lo persistido.
  syncSegmented(els.presetSeg, "preset", exportState.preset);
  syncSegmented(els.modeSeg, "mode", exportState.mode);
  els.modeSeg.hidden = exportState.preset === "original";
  els.creditToggle.checked = exportState.creditOn;
  els.creditText.value = exportState.credit;
  updateFrameMask();

  // SAVE PICTURE: compone el export final (preset + encuadre + crédito) y en
  // iOS abre la hoja de compartir (-> Instagram) vía Web Share API; en el
  // resto, descarga el PNG. Todo síncrono: debe vivir dentro del gesto.
  els.saveButton.addEventListener("click", () => {
    if (!strobe.ready) return;
    const canvas = exportImage(strobe.canvas, {
      preset: PRESETS[exportState.preset],
      mode: exportState.mode,
      offset,
      credit: exportState.creditOn ? exportState.credit : "",
    });
    const blob = dataURLtoBlob(canvas.toDataURL("image/png"));
    deliverFile(new File([blob], "sequence.png", { type: "image/png" }));
  });

  // SAVE VIDEO: el pipeline graba el canvas durante cada composición (las
  // siluetas pintándose una a una) y deja el clip en recorder.blob; aquí solo
  // se entrega. El botón aparece cuando existe la primera grabación.
  const recorder = pipeline.recorder;
  if (recorder) {
    recorder.onRecorded = () => {
      els.saveVideoButton.hidden = false;
    };
    els.saveVideoButton.addEventListener("click", () => {
      const blob = recorder.blob;
      if (!blob) return;
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      deliverFile(new File([blob], `sequence.${ext}`, { type: blob.type }));
    });
  }
}
