# Sequencer

An app to create strobe / multiplicity pictures from video.

Record a scene with a **fixed camera** where a subject moves across the frame.
The app takes the first frame as the background, detects the moving subject in
each sampled frame, and composites every position into a single image — the
classic strobe / sequence photograph.

## Usage

Because it uses ES modules, it must be served over HTTP (not opened as a
`file://` URL):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

1. Play the bundled sample video, or load your own with the file picker.
2. Press play — the **Result** canvas builds up the sequence live.
3. Tweak **Interval** (how often a frame is captured) and **Threshold** (how
   different from the background a pixel must be to count as the subject).
4. Toggle **Highlight subject** to paint the subject in a solid color.
5. **reset** clears the accumulation; **save picture** downloads a PNG.

## Structure

- `index.html` — markup and controls.
- `src/strobe.js` — background capture + per-frame accumulation (the algorithm).
- `src/video.js` — file loading and frame sampling (`requestVideoFrameCallback`).
- `src/ui.js` — wires DOM controls to the engine.
- `src/main.js` — entry point.
- `style.css`, `reset.css` — styling.
