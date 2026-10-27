# bridge-visualization

Bridge finite-element result viewer built with **Three.js + Vite**.  
It turns per-vertex simulation results (GLB geometry + JSON field metadata + float32 BIN) into a GPU heatmap, with field switching, color maps, a draggable legend and sensor anchors.

## Features

- Scalar field switching from `field_map` (no hard-coded field list)
- 11 color maps, horizontal/vertical legend, tick count and size settings
- Per-window UI state via `sessionStorage` (new windows start fresh)
- Sensor anchors with click popup (name / UID / model coordinates / diameter)
- Unified `applyFieldFrame(frame)` entry, ready for future SSE data
- Full `dispose()` lifecycle for re-mounting

## Run

```bash
npm install
npx vite
```

Open the printed local URL.

### Data

**Demo data is not included in this repository.** The viewer expects:

```text
bridge_output/
├─ 30205080.geom.glb
├─ 30205080.1784464473837.json
├─ 30205080.1784464473837.0.bin
├─ ...
└─ 30205080.1784464473837.5.bin
```

Put your own files there, or override paths via `createBridgeHeatApp(container, options)`:

```js
createBridgeHeatApp(document.body, {
    modelUrl: "/data/bridge.glb",
    timeStepJson: "/data/bridge.json",
    colorMapUrl: "/data/colorMap.json",
});
```

`index.html` uses a local `public/vendor/three` copy if present, otherwise falls back to the Three.js CDN.

## Structure

```text
index.html               entry: local three or CDN import map
colorMap.json            11 color palettes
js/
  main.js                createBridgeHeatApp() factory + SensorLayer / LegendPanel
  colorMapUtil.js        palette loading, sampling, texture cache
  standalone.js          native entry
  shaders/
    bridgeHeat.vert
    bridgeHeat.frag
DEVELOPMENT.md           architecture, data contract, API and function index
```

## Notes

- The Go backend (`main.go`, `go.mod`) is intentionally not part of this repository.
- No open-source license is granted; the code is public for viewing only.
