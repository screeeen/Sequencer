// Punto de entrada: instancia los módulos y los conecta.

import { VideoSource } from "./video.js";
import { Strobe } from "./strobe.js";
import { Pipeline } from "./pipeline.js";
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

const strobe = new Strobe(els.output);
const videoSource = new VideoSource(els.video);
const pipeline = new Pipeline(els.video, strobe);

setupUI(els, videoSource, strobe, pipeline);
