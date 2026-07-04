# Sequencer (Strobo)

An app to create strobe / multiplicity pictures from video.

Record a scene with a **fixed camera** where a subject moves across the frame.
The app builds a background model (temporal median), detects the moving subject
in each sampled frame, and composites every position into a single image — the
classic strobe / sequence photograph.

Live at **https://screeeen.github.io/Sequencer/**

## Getting started

### 1. Install it (optional, recommended on mobile)

Open the URL in your phone's browser and add it to your home screen
(Safari: Share → *Add to Home Screen*; Chrome: menu → *Install app*).
**Strobo** opens full screen and works offline.

### 2. Get a video

Any video shot with a **fixed camera** where something moves: a trick, a
jump, a goal. Ways to get one onto your phone:

- Record it yourself, or ask the author to send the file (AirDrop keeps
  full quality).
- Download your own Instagram reel (`⋯ → Download`).
- Screen-record a video you're watching — then use **trim/crop** in the app
  to cut the player UI out.

On Android you can share a video straight to the app: *Share → Strobo*.
On iOS, load it with the file picker (opens your Photos).

### 3. Make the strobe

1. **Trim**: drag the two thumbs so only the action stays — all frames are
   spent on that segment, so tighter trim = denser, better strobe.
2. **Crop**: drag the edges of the box over the video to remove UI bars or
   distractions. Changing trim/crop asks for a replay.
3. Press **Play**. The app captures during playback, picks the best
   threshold automatically, and builds the picture live.
4. Fine-tune if you want: **Interval** (spacing between copies),
   **Threshold** (detection sensitivity), **Highlight** (paint the subject a
   solid color). These update the result instantly, no replay needed.
   Curious how the threshold was chosen? Open the **Analysis** accordion.

### 4. Share it

1. Pick an **export size**: `original`, `1:1`, `4:5` or `9:16` (Instagram
   sizes, 1080 px). In **fill** mode, drag the bright window on the result
   to frame the subject; **fit** keeps everything with blurred bands.
2. Optionally toggle **add credit** to stamp the author's @handle.
3. **save picture** → on the phone this opens the share sheet (Instagram,
   Photos…); on desktop it downloads a PNG.

## Development

```sh
yarn        # once
yarn dev    # vite dev server with live reload
```

No build step is needed to deploy: GitHub Pages serves the files as-is.

## Structure

- `index.html` — markup and controls.
- `src/strobe.js` — background model + subject masking + compositing (the algorithm).
- `src/imageops.js` — image-processing primitives (median/MAD, morphology, blobs, guided filter, Otsu).
- `src/pipeline.js` — captures frames during playback (honoring trim/crop), caches them, auto-threshold, recomposites on demand.
- `src/cropper.js` — draggable crop rectangle over the video.
- `src/exporter.js` — final PNG at Instagram preset sizes (fill/fit, credit stamp).
- `src/histview.js` — the Analysis accordion (score histogram + Otsu cut).
- `src/sharedb.js` — hands the Web-Share-Target video from the service worker to the app.
- `src/video.js` — file loading.
- `src/ui.js` — wires DOM controls to the engine.
- `src/main.js` — entry point.
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA (offline shell, install, share target).
- `style.css`, `reset.css` — styling.
- `docs/` — specs and session notes.
