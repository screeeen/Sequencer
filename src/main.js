// Punto de entrada: instancia los módulos y los conecta.

import { createVideoSource } from "./video.js";
import { createStrobe } from "./strobe.js";
import { createPipeline } from "./pipeline.js";
import { createCropper } from "./cropper.js";
import { setupUI } from "./ui.js";
import { VERSION } from "./version.js";

// Referencias a todos los elementos del DOM con los que trabaja la UI.
const els = {
  video: document.getElementById("videoPlayer"),
  output: document.getElementById("output"),
  fileInput: document.getElementById("fileInput"),
  intervalInput: document.getElementById("interval"),
  intervalLabel: document.getElementById("interval-value"),
  thresholdInput: document.getElementById("threshold"),
  thresholdLabel: document.getElementById("threshold-value"),
  highlightToggle: document.getElementById("highlight"),
  colorInput: document.getElementById("color"),
  playButton: document.getElementById("play"),
  resetButton: document.getElementById("reset"),
  saveButton: document.getElementById("save"),
  progress: document.getElementById("progress"),
  progressRow: document.getElementById("status"),
  progressFill: document.getElementById("progress-fill"),
  histCanvas: document.getElementById("histogram"),
  histStats: document.getElementById("analysis-stats"),
  videoBox: document.getElementById("video-box"),
  cropRect: document.getElementById("crop-rect"),
  cropResetBtn: document.getElementById("cropReset"),
  trimRow: document.getElementById("trim-row"),
  trimIn: document.getElementById("trim-in"),
  trimOut: document.getElementById("trim-out"),
  trimLabel: document.getElementById("trim-value"),
};

// Motor de imagen, fuente de vídeo, recorte y orquestador; se conectan en setupUI.
const strobe = createStrobe(els.output);
const videoSource = createVideoSource(els.video);
const pipeline = createPipeline(els.video, strobe);
const cropper = createCropper(els.videoBox, els.cropRect);
pipeline.cropper = cropper;

setupUI(els, videoSource, strobe, pipeline, cropper);

// Muestra la versión de la app en el pie.
document.getElementById("version").textContent = `v${VERSION}`;

// Service worker (PWA). Solo fuera del dev server de vite: en dev estorba
// (cachea recargas) y en GitHub Pages import.meta.env no existe -> registra.
if (!import.meta.env?.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});
}
