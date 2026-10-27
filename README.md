# bridge-visualization

**Languages:** [English](#english-version) · [中文](#中文版)

---

## English Version

Bridge finite-element result viewer built with **Three.js + Vite**. It turns per-vertex simulation results (GLB geometry + JSON field metadata + float32 BIN) into a GPU heatmap, with field switching, color maps, a draggable legend and sensor anchors.

> <img src="assets/deepseek.svg" alt="DeepSeek" width="18" height="18"> **Powered by DeepSeek** — AI-assisted project.

### Features

- Scalar field switching from `field_map`, no hard-coded field list
- 11 color maps, horizontal/vertical legend, configurable tick count and size
- Per-window UI state via `sessionStorage`; new windows start fresh
- Sensor anchors with click popup (name / UID / model coordinates / diameter)
- Unified `applyFieldFrame(frame)` entry, ready for future SSE data
- Full `dispose()` lifecycle for re-mounting

### Run

```bash
npm install
npx vite
```

Open the printed local URL.

#### Data

Demo data is **not included** in this repository. The viewer expects:

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

### Structure

```text
index.html               entry: local three or CDN import map
colorMap.json            11 color palettes
assets/
  deepseek.svg           DeepSeek icon
js/
  main.js                createBridgeHeatApp() factory + SensorLayer / LegendPanel
  colorMapUtil.js        palette loading, sampling, texture cache
  standalone.js          native entry
  shaders/
    bridgeHeat.vert
    bridgeHeat.frag
DEVELOPMENT.md           architecture, data contract, API and function index
```

### AI Assistance

This repository contains code and documentation generated or revised with AI assistance from **DeepSeek**. The repository owner reviewed, integrated and is responsible for the final code.

<p align="center">
  <img src="assets/deepseek.svg" alt="DeepSeek" width="56" height="56"><br>
  <strong>Powered by DeepSeek</strong><br>
  <sub>AI-assisted development</sub>
</p>

### License

Copyright (c) 2026 Lin-Ziyue. **All rights reserved.**

This is a **source-available, view-only** repository, not open source. No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, sell, or create derivative works from any part of this repository without prior written permission. See [LICENSE](LICENSE) for the full notice.

### Notes

- The Go backend (`main.go`, `go.mod`) is intentionally not part of this repository.
- The code is public for viewing only; it is not licensed for reuse or modification.
- DeepSeek icon from [Simple Icons](https://simpleicons.org/) (CC0); the DeepSeek name and logo belong to DeepSeek.

---

## 中文版

基于 **Three.js + Vite** 的桥梁有限元结果可视化。它把每个顶点的仿真结果（GLB 几何 + JSON 场信息 + float32 BIN）映射成 GPU 热力图，支持物理场切换、色板、可拖动色标和传感器锚点。

> <img src="assets/deepseek.svg" alt="DeepSeek" width="18" height="18"> **由 DeepSeek 提供 AI 辅助** — 本项目在开发过程中使用了 AI。

### 功能

- 从 `field_map` 动态读取标量场，不在前端写死场列表
- 11 套色板，色标支持横/竖、刻度数量和尺寸配置
- 界面状态用 `sessionStorage` 按窗口隔离，新窗口从默认状态开始
- 传感器锚点，点击显示名称 / UID / 模型坐标 / 直径
- 统一的数据帧入口 `applyFieldFrame(frame)`，为后续 SSE 预留
- 完整的 `dispose()` 生命周期，支持反复挂载/卸载

### 运行

```bash
npm install
npx vite
```

打开终端输出的本地地址。

#### 数据

演示数据**不在本仓库中**。查看器默认读取以下结构：

```text
bridge_output/
├─ 30205080.geom.glb
├─ 30205080.1784464473837.json
├─ 30205080.1784464473837.0.bin
├─ ...
└─ 30205080.1784464473837.5.bin
```

把自有数据放到该目录，或通过 `createBridgeHeatApp(container, options)` 覆盖路径：

```js
createBridgeHeatApp(document.body, {
    modelUrl: "/data/bridge.glb",
    timeStepJson: "/data/bridge.json",
    colorMapUrl: "/data/colorMap.json",
});
```

`index.html` 会优先使用本地 `public/vendor/three`；不存在时回退到 Three.js CDN。

### 结构

```text
index.html               入口：本地 three 或 CDN import map
colorMap.json            11 套色板
assets/
  deepseek.svg           DeepSeek 图标
js/
  main.js                createBridgeHeatApp() 工厂 + SensorLayer / LegendPanel
  colorMapUtil.js        色板加载、采样、纹理缓存
  standalone.js          原生页面入口
  shaders/
    bridgeHeat.vert
    bridgeHeat.frag
DEVELOPMENT.md           架构、数据契约、API 和函数索引
```

### AI 使用说明

本仓库包含在 **DeepSeek** AI 辅助下生成或修改的代码与文档。仓库所有者已审阅并整合，对最终代码负责。

<p align="center">
  <img src="assets/deepseek.svg" alt="DeepSeek" width="56" height="56"><br>
  <strong>Powered by DeepSeek</strong><br>
  <sub>AI-assisted development · 由 DeepSeek 提供 AI 辅助</sub>
</p>

### 许可证

本仓库采用 **All rights reserved（保留所有权利）** 的仅查看许可，不是开源许可证。许可证正文仅提供英文版本，见 [LICENSE](LICENSE) 和上方 [License](#license) 章节。

### 说明

- Go 后端（`main.go`、`go.mod`）有意不包含在本仓库中。
- 代码公开仅供查看，未授权复用或修改。
- DeepSeek 图标来自 [Simple Icons](https://simpleicons.org/)（CC0）；DeepSeek 名称和图标归 DeepSeek 所有。
