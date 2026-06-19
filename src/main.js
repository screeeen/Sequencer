// Punto de entrada: instancia los módulos y los conecta.

import { createVideoSource } from "./video.js";
import { createStrobe } from "./strobe.js";
import { createPipeline } from "./pipeline.js";
import { setupUI } from "./ui.js";

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
};

const strobe = createStrobe(els.output);
const videoSource = createVideoSource(els.video);
const pipeline = createPipeline(els.video, strobe);

setupUI(els, videoSource, strobe, pipeline);
