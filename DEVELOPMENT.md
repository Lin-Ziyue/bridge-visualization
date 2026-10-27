# 桥梁热力图显示台 · 开发文档

> 项目路径：`D:\demo\three`
> 技术栈：原生 ES Module + Three.js 0.185.1 + Vite 8
> 文档版本：2026-10-25
> 对应代码：`js/main.js`（1660 行）、`js/colorMapUtil.js`、`js/shaders/*`、`index.html`

---

## 目录

1. [项目定位](#1-项目定位)
2. [快速开始](#2-快速开始)
3. [目录结构](#3-目录结构)
4. [数据契约](#4-数据契约)
5. [架构总览](#5-架构总览)
6. [渲染原理](#6-渲染原理)
7. [模块与函数说明](#7-模块与函数说明)
8. [对外 API](#8-对外-api)
9. [配置项](#9-配置项)
10. [界面状态存储（sessionStorage）](#10-界面状态存储sessionstorage)
11. [资源生命周期](#11-资源生命周期)
12. [已知问题与限制](#12-已知问题与限制)
13. [后续演进路线](#13-后续演进路线)
14. [常见问题](#14-常见问题)

---

## 1. 项目定位

这是一个**桥梁有限元结果的三维热力图显示台**：后端算出的仿真结果（每个顶点一个物理量）在前端映射成颜色，贴在桥梁模型表面；模型上叠加传感器锚点，点击可查看坐标。

**当前阶段**：静态数据原型。前端直接读取预生成的三类文件，尚未接入实时推送与 FEM 服务。

**为什么先做这个**：先把三维显示做出来，确认数据链路和视觉效果，再逐步加 React 框架、Go 服务器、SSE 实时推送、最终对接 FEM 计算后端。

---

## 2. 快速开始

### 2.1 环境要求

- Node.js 18+
- 浏览器支持 WebGL2（Chrome / Edge / Firefox 新版）

### 2.2 安装依赖

```powershell
cd D:\demo\three
npm install
```

### 2.3 启动开发服务器

```powershell
cd D:\demo\three
npx vite
```

默认地址：<http://127.0.0.1:5173/>

> **注意**：本项目 `package.json` 没有 `scripts` 字段，`npm run dev` 不可用。
> 如果 PowerShell 提示"禁止运行脚本"，改用：
> ```powershell
> node .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5173
> ```
> 或 `npx.cmd vite`。

### 2.4 生产构建

```powershell
npx vite build
```

产物在 `dist/`，可用任意静态服务器托管（例如 `npx vite preview`）。

### 2.5 关于 `go run main.go`

根目录有一个 `main.go`，是早期静态托管实验，**不是当前入口**：

- 只把 `index.html` 直接返回；
- `/static/` 处理函数是空的；
- 不处理 ES module 的 MIME 类型和缓存。

开发与部署请统一使用 Vite。

---

## 3. 目录结构

```text
D:\demo\three\
├─ index.html                 入口页：运行时决定用本地 three 还是 CDN
├─ colorMap.json              色板定义（11 套）
├─ package.json               依赖：three ^0.185.1、vite ^8.1.4
├─ main.go                    早期静态服务实验（未使用）
├─ go.mod                     对应 main.go
│
├─ js\
│  ├─ standalone.js           原生页面入口
│  ├─ main.js                 主模块（工厂函数，约 1660 行）
│  ├─ colorMapUtil.js         色板管理
│  └─ shaders\
│     ├─ bridgeHeat.vert      顶点着色器
│     └─ bridgeHeat.frag      片元着色器
│
├─ bridge_output\             预生成数据（开发用）
│  ├─ 30205080.geom.glb                桥梁几何（4221 顶点）
│  ├─ 30205080.static.json             静态信息（点映射表）
│  ├─ 30205080.1784464473837.json      场信息 + 值域
│  └─ 30205080.1784464473837.{0..5}.bin  每个场一个二进制数组
│
└─ public\                    Vite 静态资源根（会被原样部署）
   ├─ model.glb               历史遗留模型
   ├─ bridge_output\          bridge_output 的副本
   └─ vendor\three\           自托管 three 0.185.1
      ├─ three.module.js
      └─ jsm\{loaders,controls,utils}\
```

### 3.1 历史遗留文件（可忽略）

| 文件/目录 | 说明 |
|---|---|
| `segs/1.js`、`segs/2.js` | 早期版本副本，未被加载 |
| `copy.js`、`BridgeHeatShader.js` | 早期实验版（DataTexture 采样），未被 import |
| `*.bak` 系列 | 各阶段备份 |

> **待清理项见第 12 节。**

---

## 4. 数据契约

### 4.1 模型几何（GLB）

```text
桥面网格，4221 顶点，带 POSITION / NORMAL / indices
包围盒：x 0~2，y ±0.062，z ≈ 0（薄板）
约定：1 模型单位 ≈ 1 米
```

GLB 内**没有材质**，材质由前端热力 ShaderMaterial 接管。

### 4.2 场信息（JSON）

```json
{
  "modelId": "30205080",
  "surface_vertex_count": 4221,
  "field_map": {
    "0": { "field_name": "strain_xx",            "valueMin": -5.81e-6, "valueMax": 5.81e-6, "source": "point_data" },
    "1": { "field_name": "strain_yy_poisson",    "valueMin": -1.63e-6, "valueMax": 1.63e-6 },
    "2": { "field_name": "strain_zz_poisson",    "valueMin": -1.63e-6, "valueMax": 1.63e-6 },
    "3": { "field_name": "bending_moment_Nm",    "valueMin": 0,        "valueMax": 25.0 },
    "4": { "field_name": "curvature_1_per_m",    "valueMin": 0,        "valueMax": 9.37e-5 },
    "5": { "field_name": "vtkOriginalPointIds",  "valueMin": 0,        "valueMax": 4220.0 }
  }
}
```

- `field_map` 的 key 是**场编号**，决定 bin 文件名；
- `valueMin` / `valueMax` 是该场的值域，用于颜色归一化。

### 4.3 场数据（BIN）

```text
文件名：30205080.1784464473837.<fieldId>.bin
内容：连续的 float32 小端，长度 = surface_vertex_count（4221）
语义：第 i 个 float 对应 geometry 的第 i 个顶点
字节数校验：文件大小 = 顶点数 × 4（当前 16884 字节）
```

### 4.4 帧结构（前端内部）

前端把「一个场的一帧」统一成这个结构，静态加载和未来 SSE 推送共用：

```js
{
    modelId: "30205080",
    fieldId: 0,
    fieldName: "strain_xx",
    valueMin: -5.806819899589755e-06,
    valueMax:  5.806819899589755e-06,
    values: Float32Array(4221),
    timestamp: 0,              // 预留
}
```

### 4.5 色板（colorMap.json）

```json
[
  {
    "name": "viridis",
    "label": "Viridis",
    "stops": [
      { "value": 0.0, "r": 68, "g": 1,  "b": 84 },
      { "value": 0.5, "r": 33, "g": 144, "b": 141 },
      { "value": 1.0, "r": 253, "g": 231, "b": 37 }
    ]
  }
]
```

- `name`：内部键，用于切换和存储；
- `label`：UI 显示名；
- `stops`：0~1 上的颜色节点，段数任意，前端会插值成 256×1 纹理。

**内置 11 套**：Viridis、Plasma、Inferno、Magma、Cividis、Turbo、Coolwarm、RdBu、Spectral、Grayscale、Jet。

### 4.6 添加新场

1. 用 Python 把新物理量导出成 `float32` 数组（长度 = 顶点数）；
2. 落成 `30205080.<时间戳>.<新id>.bin`；
3. 在对应 JSON 的 `field_map` 里加一条记录，写 `field_name`、`valueMin`、`valueMax`；
4. 刷新页面，Field 下拉会自动多出这一项，无需改代码。

---

## 5. 架构总览

### 5.1 数据流

```text
┌─────────────┐
│ Python / FEM│  离线计算出每个顶点的物理量
└──────┬──────┘
       │ 导出
       ▼
  GLB + JSON + BIN
       │ fetch（静态阶段）
       ▼
┌──────────────────────────────────────┐
│ 前端 createBridgeHeatApp             │
│                                      │
│  loadTimeStep(json, fid)             │
│    ├─ ensureTimeStepData  读+缓存JSON│
│    ├─ loadHeatBin         读对应bin  │
│    └─ applyFieldFrame     组装成帧   │
│          └─ applyHeatField           │
│               ├─ setHeatRange        │
│               ├─ createHeatMaterial  │
│               └─ 写 aHeatValue       │
└──────────────┬───────────────────────┘
               │
               ▼
       顶点属性 aHeatValue
               │ 顶点着色器
               ▼
         varying vHeatVal
               │ 片元着色器
               ▼
    t = (vHeatVal - min) / (max - min)
    color = texture2D(uColorMap, vec2(t, 0.5))
```

### 5.2 三维场景层级

```text
scene
└─ transform_wrapper             统一变换层（缩放 + 偏移）
   ├─ root_model                 桥面（热力材质）
   └─ root_markers
      └─ group_sensor            传感器层
         ├─ sensorAnchor ×6      position = 桥模型坐标
         │  └─ 球 / sensor.glb   显示体
         └─ ...
```

**设计要点**：桥和传感器共享 `transform_wrapper`，视图适配只改这一层，传感器自动跟随。

### 5.3 UI 层

| 位置 | 元素 | 说明 |
|---|---|---|
| 左上角 | Reset View | 相机回默认位置 |
| 右下角 | 色标面板 | 可拖动，位置记忆 |
|  | ├ 标题 | 当前场名 + Reset Pos. 按钮 |
|  | ├ Field 下拉 | 切换物理场 |
|  | ├ 色板选择器 | 展开时才显示预览条 |
|  | ├ 色条 | 横/竖可配，尺寸可配 |
|  | └ 刻度 | 数值 + 刻度线 |
| 跟随鼠标 | 传感器弹窗 | 点击传感器时显示 |

所有 UI 都挂在 `createBridgeHeatApp` 传入的 `container` 下，不写死到 `document.body`。

**组件化**：色标面板已经收束成 `LegendPanel` 类，传感器层已经收束成 `SensorLayer` 类（都定义在 `main.js` 内，未拆文件）。类内部持有各自的状态、DOM/3D 对象和生命周期方法；`main.js` 只保留 `legendPanel`、`sensorLayer` 两个实例和少量调用。

### 5.4 可继续收束的候选

判断标准：**有独立状态 + 有 DOM/3D 对象 + 有生命周期**，才值得收成组件类；纯函数保持函数。

已完成：`LegendPanel`（色标面板）、`SensorLayer`（传感器层）。

| 候选 | 当前涉及的代码 | 建议 | 理由 |
|---|---|---|---|
| `ViewControls` | `camera`、`orbitControls`、`cachedBridgeBoxInfo`、`cachedFitDistance`、`fitCameraByRawBox`、`resizeHandler`、`resetView`、Reset View 按钮 | 可选 | 属于渲染核心，抽出来收益中等，容易和场景初始化互相牵扯 |
| `HeatLayer` / `FieldData` | `bridgeHeatMaterial`、`currentFieldMin/Max/Name/Id`、`timeStepDataCache`、`createHeatMaterial`、`applyFieldFrame`、`loadTimeStep` | 暂缓 | 与 `LegendPanel`（读场信息）、`dispose` 交叉较多，等接 SSE / 动态数据时再收更合适 |
| `formatLegendValue`、`buildLegendGradient` | 纯格式化 | 保持函数 | 无状态，不需要类 |

> 原则：不为了“看起来像组件”而强行合并。热力材质和数据加载现在仍是主线流程的一部分，过早包类会增加跨模块调用。

---


## 6. 渲染原理

### 6.1 顶点着色器（bridgeHeat.vert）

```glsl
attribute float aHeatValue;   // 每个顶点一个热力值
varying float vHeatVal;

void main() {
    vHeatVal = aHeatValue;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
```

职责：把顶点属性透传给片元，做标准 MVP 变换。

### 6.2 片元着色器（bridgeHeat.frag）

```glsl
uniform float uValMin;
uniform float uValMax;
uniform sampler2D uColorMap;

void main() {
    float t = clamp((vHeatVal - uValMin) / max(uValMax - uValMin, 1e-20), 0.0, 1.0);
    vec3 outColor = texture2D(uColorMap, vec2(t, 0.5)).rgb;
    gl_FragColor = vec4(outColor, 1.0);
}
```

职责：把热力值归一化到 0~1，然后查色板纹理。

**为什么用纹理而不是 GLSL 数组**：GLSL ES 1.0 要求数组长度编译期固定，色板段数一变就得改着色器；纹理法只传一张图，色板段数任意。

**为什么用 GLSL ES 1.00**：three r185 的 `ShaderMaterial` 默认走 GLSL ES 1.00，`gl_FragColor` 和 `texture2D` 仍然有效，不需要改成 GLSL3。

### 6.3 色板纹理生成

`buildColorTexture(name)` 在 CPU 端采样：

```text
在 0~1 上取 256 个等距点
每个点找到所在的两段颜色
线性插值出 rgb
写入 Uint8Array (256 × 4)
包成 THREE.DataTexture（LinearFilter + ClampToEdge）
按名字缓存，重复切换同一色板不重建
```

### 6.4 数值归一化兜底

`setHeatRange(min, max)` 会先做两级兜底：

```text
差值 < 1e-6         → 以中点为中心扩展到 ±2e-6
|max - min| < 1e-12 → 分别 ±1
```

**原因**：应变值量级 `1e-6`，若直接用原始 min/max，浮点精度会让颜色几乎全部落在同一档。

---

## 7. 模块与函数说明

### 7.1 入口模块

#### `index.html`

运行时决定 three 的来源：

```js
const THREE_VERSION = "0.185.1";
// 先 HEAD 探测 /vendor/three/three.module.js
// 存在 → importmap 指向本地
// 不存在 → importmap 指向 jsdelivr CDN（版本固定 0.185.1）
// 然后 await import("/js/standalone.js")
```

**设计考虑**：部署环境不确定是否联网，本地优先、CDN 兜底，版本必须与 `package.json` 一致。

#### `js/standalone.js`

```js
import { createBridgeHeatApp } from "./main.js";
createBridgeHeatApp(document.body);
```

原生页面入口，整个视口作为挂载容器。

---

### 7.2 `js/main.js`

单文件工厂模块。结构按功能顺序排列：

```text
配置 → 场景层级 → 状态变量 → 基础设施 → 资源加载 → 视图 → 传感器
→ 色标 UI → 热力材质 → 资源释放 → 数据 → 初始化 → 渲染循环 → API
```

#### 7.2.1 入口与配置

| 函数 | 说明 |
|---|---|
| `createBridgeHeatApp(container, options)` | 工厂函数。所有状态在闭包内，可多实例、可销毁。`options` 覆盖默认配置 |

调用方式：

```js
const app = createBridgeHeatApp(document.body);
// 或
const app = createBridgeHeatApp(el, {
    modelUrl: "/data/bridge.glb",
    timeStepJson: "/data/bridge.json",
    fieldId: 0,
    sensorMode: "glb",
});
```

#### 7.2.2 资源加载

| 函数 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `loadGLTF(url)` | 模型地址 | `Promise<THREE.Group>` | Promise 化 GLTFLoader；空 URL 直接抛错 |
| `loadShaderFile(filePath)` | 着色器路径 | `Promise<string>` | fetch 文本；检查 `res.ok` |
| `loadHeatBin(binUrl)` | bin 地址 | `Promise<Float32Array>` | 只取数，不碰材质；检查 `res.ok` |
| `ensureTimeStepData(jsonUrl)` | JSON 地址 | `Promise<Object>` | 读取并缓存，切场不重复请求 |
| `sensorLayer.loadTemplate()` | — | `Promise<Group\|null>` | GLB 模式加载传感器模板，失败返回 null |

#### 7.2.3 视图与相机

| 函数 | 说明 |
|---|---|
| `calcModelRawBox(root_model)` | 计算包围盒、尺寸、中心，返回 `{ box, size, center }` |
| `fitCameraByRawBox(boxResult)` | 根据包围盒计算 `transform_wrapper` 的缩放和偏移 |
| `resizeHandler()` | 窗口变化时更新 camera/ renderer 并重新适配 |
| `resetView()` | 相机回 `(0,0,3)`，控制器目标回 `(0,0,0)` |
| `createViewResetButton()` | 创建左上角按钮 |

**适配算法**：

```text
distance  = 相机到模型中心距离（首次计算后锁定）
视高      = 2 × tan(fov/2) × distance
目标尺寸  = 视高 × 1.5
缩放比    = 目标尺寸 / 模型最大边
偏移      = 模型中心 × 缩放比
```

**为什么锁距离**：用户在轨道控制器里缩放后再拖窗口，若重新读取 `camera.position` 计算，画面会突然跳变。

#### 7.2.4 传感器（SensorLayer 类）

传感器层不再是一组散落的函数和全局变量，而是 `SensorLayer` 类，定义在 `main.js` 内。类持有锚点列表、模板、共享球体资源、弹窗和射线拾取状态，并自己绑定/解绑 canvas 点击事件。

| 成员 | 职责 |
|---|---|
| `constructor({group,camera,canvas,container})` | 保存依赖，初始化射线/鼠标，绑定 canvas click |
| `getRadius(diameterMm)` | 毫米 → 模型单位：`(mm/1000)/2/modelUnitToMeter` |
| `loadTemplate()` | GLB 模式加载一次模板；失败回退球体 |
| `normalizeModel(root, diameter)` | 缩放到目标直径，几何中心移到原点 |
| `buildVisual(anchor)` | 有模板用 GLB clone，否则用共享球体 |
| `buildDefaultSpecs(box)` | 生成 6 个占位传感器（4 角 + 2 长边中点） |
| `createAnchor(spec)` | 创建单个锚点 + 显示体 |
| `createDefault(box)` | 用默认布局创建 |
| `createFromSpecs(specs)` / `clear()` | 按外部数据重建；重建前释放旧锚点 |
| `findAnchor(object)` | 从子 mesh 向上找到锚点 |
| `handleClick(event)` | 射线拾取，命中则弹窗，否则关闭 |
| `ensurePopup()` / `showPopup()` / `hidePopup()` | 懒创建、填充、隐藏弹窗 |
| `dispose()` | 解绑 click，释放锚点/模板/共享资源/弹窗 |

**锚点数据结构**：

```js
anchor.userData = {
    type: "sensor",
    uid: "S-00",
    name: "传感器0",
    diameterMm: 30,
    coordinateSystem: "bridge",
};
anchor.position = (x, y, z);   // 桥模型坐标系
```

**外部导入传感器**（预留）：解析 JSON/CSV 后调用：

```js
sensorLayer.createFromSpecs(specs);
```

```js
[
  { uid: "S-00", name: "传感器0", x: 0, y: -0.062, z: 0, diameterMm: 30 },
  ...
]
```

#### 7.2.5 物理场数据

| 函数 | 说明 |
|---|---|
| `getFieldOptions()` | 从缓存的 JSON 读出 `[{ id, name }]` |
| `syncFieldSelect()` | 同步 Field 下拉的选项与选中值 |
| `switchField(fid)` | 切换场；带 `fieldLoading` 锁防连点 |
| `loadSavedFieldId()` | 读取上次选择的场 |
| `saveActiveField(fid)` | 保存选择的场 |
| `applyFieldFrame(frame)` | **统一帧入口**，静态与实时共用 |
| `loadTimeStep(jsonUrl, fid)` | 读 JSON + bin，组装帧并应用 |
| `applyHeatField(min, max, values)` | 定值域 → 建材质 → 写属性 → 换材质 |

**`applyHeatField` 内部顺序**（关键）：

```js
setHeatRange(min, max);                      // 1. 先定值域
if (!bridgeHeatMaterial) createHeatMaterial(); // 2. 再建材质（取到正确值域）
// 3. 按顶点数累计切片写入 aHeatValue
// 4. 释放 glTF 默认材质，换热力材质
```

**多 mesh 切片**：

```js
let offset = 0;
root_model.traverse(mesh => {
    const count = geo.attributes.position.count;
    const slice = values.subarray(offset, offset + count);
    offset += count;
    // 长度一致时复用已有 BufferAttribute，否则重建
});
```

**场选择兜底**：保存的场若已不存在，回退到 `config.fieldId`，仍不存在则取第一个可用场。

#### 7.2.6 热力材质与值域

| 函数 | 说明 |
|---|---|
| `createHeatMaterial()` | 创建 ShaderMaterial（先释放旧的） |
| `disposeHeatMaterial()` | 释放材质本体 |
| `setHeatRange(min, max)` | 归一化值域、同步 uniform、刷新色标 |
| `switchColorMap(name)` | 切色板：记住 → 重建材质 → 换材质 → 刷新色标 |

uniform 结构：

```js
uniforms: {
    uValMin:   { value: currentFieldMin },
    uValMax:   { value: currentFieldMax },
    uColorMap: { value: colorTexture },      // 256×1 色板纹理
}
```

#### 7.2.7 色标面板（LegendPanel 类）

色标面板不再是一组散落的函数和全局变量，而是一个组件类，定义在 `main.js` 内（未拆文件）。类持有设置、DOM 引用、拖动位置、展开状态，并负责创建、刷新、布局、设置持久化和销毁。

| 成员 | 职责 |
|---|---|
| `constructor()` | 初始化默认设置和内部状态 |
| `create()` | 构建 DOM、绑定事件、恢复位置、首次刷新 |
| `dispose()` | 移除 DOM、解绑 document/window 监听、清理拖动状态 |
| `buildRoot()` / `buildTitle()` / `buildFieldRow()` / `buildColorPicker(maps)` / `buildBar()` | 分块构建面板 |
| `update()` | 统一刷新色条、预览条、名称、标题、场下拉、高亮 |
| `syncFieldSelect()` | 同步 Field 下拉选项与选中值 |
| `setFieldDisabled(disabled)` | 切场期间禁用下拉 |
| `updateTicks()` | 按 `tickCount` 生成数值和刻度线 |
| `applyLayout()` | 横/竖布局与色条尺寸 |
| `setOptions(options)` / `getOptions()` | 设置读写（对外 API 委托到这里） |
| `loadSettings()` / `saveSettings()` | 窗口内设置持久化（sessionStorage） |
| `loadPosition()` / `savePosition(left,top)` / `applyPosition()` / `resetPosition()` / `clampPosition()` | 窗口内位置持久化与视口约束 |
| `makeDraggable()` | 整个面板拖动 |
| `setPickerOpen(open)` | 展开/收起色板选择面板 |

`formatLegendValue` / `buildLegendGradient` 仍是工厂内的纯函数，供类直接调用；`createViewResetButton` 属于视图层，不在这个类里。

**刻度规则**：

```text
tickCount = N（2~10）
第 i 个刻度：ratio = i / (N - 1)
数值 = min + (max - min) × ratio
必然包含最左 0% 和最右 100%
```

**预览条规则（硬性）**：色板预览条只在选择面板展开时显示，收起时隐藏。

#### 7.2.8 资源释放

| 函数 | 说明 |
|---|---|
| `disposeTexture(texture)` | 释放贴图（Set 去重） |
| `disposeMaterial(material)` | 释放材质及已知槽位贴图 |
| `disposeObject3D(root)` | 递归释放几何体、材质、贴图 |
| `disposeAllResources()` | 整体卸载，幂等 |

`TEXTURE_SLOTS` 覆盖的槽位：

```text
map, normalMap, bumpMap, emissiveMap, roughnessMap, metalnessMap,
alphaMap, aoMap, lightMap, displacementMap, specularMap, envMap
```

**释放顺序**：

```text
1. setAnimationLoop(null)          停渲染循环
2. 移除 window/document 监听 + orbitControls.dispose()
3. 释放几何体 / 材质 / 贴图 / 色板纹理
4. 移除 UI DOM（弹窗、色标面板、按钮）
5. 清空场景层级
6. 清空业务缓存
7. 移除 canvas + renderer.dispose() + forceContextLoss()
```

**为什么要 `forceContextLoss`**：浏览器 WebGL 上下文数量有限，反复挂载不释放会导致新实例创建失败。

#### 7.2.9 初始化与渲染循环

`initScene()` 顺序：

```text
1. 读顶点/片元着色器
2. 读色板 JSON → 缓存
3. 恢复色标设置和色板选择
4. 加载 GLB → 加入 root_model
5. 计算包围盒 → 适配视图
6. 加载传感器模板（可选）
7. 创建 6 个传感器
8. 加载首帧热力（恢复上次选的场）
9. 创建色标面板 + Reset View 按钮
```

每个 `await` 之后都检查 `resourcesDisposed`，防止初始化中途被卸载后继续写场景。

`animate()`：每帧 `orbitControls.update()` + `renderer.render()`，通过 `setAnimationLoop` 驱动。

---

### 7.3 `js/colorMapUtil.js`

| 函数 | 说明 |
|---|---|
| `loadColorMaps(file)` | 读取色板 JSON，检查 `res.ok` |
| `setActiveMap(name)` | 设置当前色板（唯一写入口） |
| `getAllColorMaps()` | 返回深拷贝，防止外部修改内部数据 |
| `getActiveMapName()` | 读当前色板名 |
| `buildColorTexture(name)` | 采样成 256×1 DataTexture，带缓存 |
| `disposeColorMapTextures()` | 释放所有缓存纹理 |

内部状态：

```js
let colorMapList = [];            // 从 JSON 载入
let activeMapName = "viridis";    // 当前色板
const colorTextureCache = new Map();  // name → DataTexture
```

---

### 7.4 着色器

| 文件 | 职责 | 输入 | 输出 |
|---|---|---|---|
| `bridgeHeat.vert` | 透传热力值 + MVP 变换 | `aHeatValue` | `vHeatVal`、`gl_Position` |
| `bridgeHeat.frag` | 归一化 + 查色板 | `vHeatVal`、`uValMin/Max`、`uColorMap` | `gl_FragColor` |

---

## 8. 对外 API

```js
const app = createBridgeHeatApp(container, options);
```

| API | 说明 |
|---|---|
| `app.dispose()` | 完整卸载，幂等 |
| `app.resize()` | 容器尺寸变化时手动调用（React 接 ResizeObserver） |
| `app.setColorMap(name)` | 切换色板，如 `"turbo"` |
| `app.setField(fid)` | 切换物理场 |
| `app.getFields()` | 返回 `[{ id, name }]` |
| `app.getFieldId()` | 当前场编号 |
| `app.loadTimeStep(jsonUrl, fid)` | 重新加载某一帧 |
| `app.applyFieldFrame(frame)` | 直接推一帧（实时数据用） |
| `app.setLegendOptions(opts)` | 设置色标参数 |
| `app.getLegendOptions()` | 读取色标参数 |
| `app.resetView()` | 相机回默认 |
| `app.canvas` | `renderer.domElement` |
| `app.scene` | `THREE.Scene` |
| `app.camera` | `THREE.PerspectiveCamera` |
| `app.controls` | `OrbitControls` |

### 8.1 实时数据接入示例

```js
// 未来 SSE 推送时
source.onmessage = (e) => {
    const data = JSON.parse(e.data);
    app.applyFieldFrame({
        modelId: data.modelId,
        fieldId: data.fieldId,
        fieldName: data.fieldName,
        valueMin: data.valueMin,
        valueMax: data.valueMax,
        values: new Float32Array(data.values),  // 或二进制 ArrayBuffer
        timestamp: data.timestamp,
    });
};
```

### 8.2 React 接入示例

```jsx
import { useEffect, useRef } from "react";
import { createBridgeHeatApp } from "./core/bridgeHeatApp.js";

export default function BridgeHeatView() {
    const hostRef = useRef(null);
    const appRef = useRef(null);

    useEffect(() => {
        const app = createBridgeHeatApp(hostRef.current, {
            shaderDir: "/heat/shaders",
            dataDir: "/heat/bridge_output",
            colorMapUrl: "/heat/colorMap.json",
            modelUrl: "/heat/bridge_output/30205080.geom.glb",
            timeStepJson: "/heat/bridge_output/30205080.1784464473837.json",
        });
        appRef.current = app;

        const ro = new ResizeObserver(() => app.resize());
        ro.observe(hostRef.current);

        return () => {
            ro.disconnect();
            app.dispose();
            appRef.current = null;
        };
    }, []);

    return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}
```

---

## 9. 配置项

### 9.1 工厂 options

| 字段 | 默认值 | 说明 |
|---|---|---|
| `shaderDir` | `"./js/shaders"` | 着色器目录 |
| `dataDir` | `"./bridge_output"` | 数据目录（当前仅语义占位） |
| `colorMapUrl` | `"/colorMap.json"` | 色板 JSON 地址 |
| `modelUrl` | `"./bridge_output/30205080.geom.glb"` | 模型地址 |
| `timeStepJson` | `"./bridge_output/30205080.1784464473837.json"` | 场信息 JSON 地址 |
| `fieldId` | `0` | 默认物理场 |
| `sensorMode` | `"sphere"` | `"sphere"` 画球 / `"glb"` 加载模型 |
| `sensorDiameterMm` | `30` | 传感器统一直径（毫米） |
| `modelUnitToMeter` | `1` | 1 模型单位对应多少米 |
| `sensorModelUrl` | `"./models/sensor.glb"` | 传感器模型地址 |

### 9.2 色标设置（`legendSettings`）

| 字段 | 默认值 | 范围 | 说明 |
|---|---|---|---|
| `orientation` | `"horizontal"` | `horizontal` / `vertical` | 色条方向 |
| `defaultColorMap` | `"viridis"` | 色板 name | 默认色板（无历史选择时生效） |
| `tickCount` | `3` | 2~10 | 刻度数量，含两端 |
| `showTickMarks` | `true` | boolean | 刻度线显隐（数值始终显示） |
| `barLength` | `null` | 40~600 或 null | 色条长度 px，null 为自适应 |
| `barThickness` | `14` | 6~60 | 色条厚度 px |

---

## 10. 界面状态存储（sessionStorage）

界面状态按**窗口**隔离，使用 `sessionStorage`，不使用 `localStorage`。

| 键 | 内容 | 说明 |
|---|---|---|
| `bridgeHeat.activeColorMap` | 色板 name | 最后一次手动选择的色板 |
| `bridgeHeat.activeFieldId` | 场编号 | 最后一次选择的物理场 |
| `bridgeHeat.legendSettings` | JSON | 色标设置 |
| `bridgeHeat.legendPosition` | `{ left, top }` | 色标面板拖动位置 |

行为：

| 场景 | 结果 |
|---|---|
| 同一窗口刷新 | 保留 |
| 同一浏览器新开窗口/新标签 | 不共享，回到默认 |
| 关闭窗口/标签 | 清除 |
| 同一浏览器的其他窗口 | 互不影响 |
| 另一台电脑 | 天然独立，不会同步 |
| 旧版 `localStorage` 键 | 代码不再读取；需要时手动清理 |

> **为什么不用 `localStorage`**：它按「协议 + 域名 + 端口」共享给同一浏览器的所有窗口。在一个窗口改色板，新开窗口刷新会读到同一份配置，看起来像“配置同步”。`sessionStorage` 的生命周期是单个窗口，正好符合“多窗口/多电脑各自独立”的需求。

重置方法（在当前窗口控制台执行）：

```js
sessionStorage.removeItem('bridgeHeat.activeColorMap');
sessionStorage.removeItem('bridgeHeat.activeFieldId');
sessionStorage.removeItem('bridgeHeat.legendSettings');
sessionStorage.removeItem('bridgeHeat.legendPosition');
```

> 注意：`sessionStorage` 同样按「协议 + 域名 + 端口」隔离，`127.0.0.1:5173` 与 `localhost:5173` 不共享。

---

## 11. 资源生命周期

### 11.1 创建顺序

```text
1. renderer + canvas（构造时）
2. 场景层级（构造时）
3. 着色器文本（initScene）
4. 色板纹理（首次创建热力材质时，按需）
5. 桥模型几何与材质（initScene）
6. 传感器锚点（initScene）
7. 热力材质（首帧数据时）
8. UI DOM（initScene 末尾，按需）
```

### 11.2 释放

统一走 `app.dispose()`，内部幂等。重复调用安全。

### 11.3 防泄漏要点

- 材质/几何体/纹理用 `Set` 去重，避免重复 dispose；
- 色板纹理由 `colorMapUtil` 集中缓存与释放；
- 所有 `window` / `document` 监听都在 `dispose` 中解除；
- `resourcesDisposed` 标记阻止销毁后的异步回调继续创建资源；
- 卸载时调用 `forceContextLoss` 释放 WebGL 上下文。

---

## 12. 已知问题与限制

### 12.1 功能限制

| 项 | 现状 | 后续 |
|---|---|---|
| 场类型 | 仅支持**标量场**（每顶点 1 个 float） | 张量场需先降维（见 13.2） |
| 实时数据 | 静态文件 | 接 SSE 后走 `applyFieldFrame` |
| 传感器来源 | 代码内 6 个占位 | 支持 JSON/CSV 导入（`sensorLayer.createFromSpecs` 已预留） |
| 传感器模型 | 没有真实 GLB，默认画球 | 放入 `models/sensor.glb` 并设 `sensorMode: "glb"` |
| 传感器朝向 | 未贴合表面法线 | 后续按法线偏移/朝向 |
| Settings | 仅有 API，无 UI | 后续在 React 里做面板 |
| 色板 UI | 原生 DOM | 迁移 React 时可复用同一套 API |

### 12.2 代码待整理项

| 位置 | 问题 | 建议 |
|---|---|---|
| `js/*.bak`、`*.pre-*.bak` | 多份历史备份混在源码目录 | 移到 `backup/` 或删除 |
| `segs/`、`copy.js`、`BridgeHeatShader.js` | 早期死代码，未被引用 | 删除或归档 |
| `bridge_output/` 与 `public/bridge_output/` | 内容重复 | 只保留 `public/`（Vite 部署需要） |
| `public/model.glb` | 历史遗留 | 确认无用后删除 |
| `main.go`、`go.mod` | 未使用的静态服务实验 | 确认后删除，避免误用 |
| `config.dataDir` | 定义了但未实际使用 | 后续统一路径拼接时启用 |
| `index.html` 标题 | 仍是 `My first three.js app` | 改成正式名称 |

### 12.3 兼容性

- 依赖 WebGL2；
- 依赖 `sessionStorage`（不可用时降级为 `console.warn`，功能仍可用但当前窗口无记忆）；
- 依赖 `ResizeObserver`（React 接入时用）。

---

## 13. 后续演进路线

### 13.1 阶段规划

| 阶段 | 内容 | 依赖 |
|---|---|---|
| 1（当前） | 原生 Three.js 热力图原型 | — |
| 2 | 迁入 React + ECharts，Settings 用组件库面板 | 组件库选型 |
| 3 | Go 服务器托管静态资源，加健康检查 | 目录分层 |
| 4 | 静态转动态：模拟 SSE 推送 `FieldFrame` | 阶段 2、3 |
| 5 | Go 实现 SSE + data_bus | 阶段 4 |
| 6 | 对接 FEM：Python gRPC → Go 拉取 → 转换 → 推送 | 阶段 5 |

### 13.2 张量场显示

当前链路只能显示标量。张量（6/9 分量）需要先降维：

| 方案 | 显示内容 | 改动范围 |
|---|---|---|
| A. 不变量热力图 | von Mises、最大/最小主应变、最大剪应变、体积应变 | Python 算好导成新场，前端零改动 |
| B. 分量热力图 | εxx/εyy/εzz/εxy/εxz/εyz | Python 拆成 6 个场 |
| C. 主方向 glyph | 箭头/圆锥，方向=特征向量，长度/颜色=特征值 | 前端新增渲染层 |
| D. 张量椭球 | 椭球三轴=特征值，朝向=特征向量 | 前端新增渲染层，成本最高 |

**推荐**：先做 A（复用现有链路），再视需求做 C。

Python 侧参考：

```python
T = raw.reshape(-1, 3, 3)
T = 0.5 * (T + T.transpose(0, 2, 1))
eigvals, eigvecs = np.linalg.eigh(T)
e3, e2, e1 = eigvals[:, 0], eigvals[:, 1], eigvals[:, 2]
von_mises  = np.sqrt(((e1-e2)**2 + (e2-e3)**2 + (e3-e1)**2) / 2)
max_shear  = (e1 - e3) / 2
volumetric = (e1 + e2 + e3) / 3
```

### 13.3 目标目录结构（参考方案文档）

```text
smart-screen-fixed-point-1/
├─ screen/          可打包 Go 核心库
├─ cmd/server/      启动入口
├─ internal/        业务适配层
├─ web/             静态资源托管
├─ frontend/        React + Three.js
└─ configs/         全局配置
```

前端对应拆分：

```text
frontend/src/
├─ core/       scene.js / camera.js / renderer.js
├─ models/     BaseModel.jsx / VModel.jsx / TKModel.jsx
├─ sse/        数据接收
└─ control/    指令发送
```

---

## 14. 常见问题

### Q1：页面全黑，只有模型没有颜色

历史问题，原因通常有两个：

1. 热力材质没有被应用（`bridgeHeatMaterial` 为 null）；
2. `uValMax` 用了错误的默认值（曾固定为 100），导致归一化 `t ≈ 0`，取到色板最暗端。

当前代码已修复：`setHeatRange` 会同步 `currentFieldMax`，`applyHeatField` 保证先定值域再建材质。

### Q2：切换物理场没反应

检查 Console 是否有 `加载时序数据失败`，以及对应 `.bin` 是否存在且大小 = 顶点数 × 4。

### Q3：色板和模型颜色不一致

两者同源（都从 `colorMap.json` 生成），若不一致请检查 `buildColorTexture` 是否被异常缓存。

### Q4：`npx vite` 提示禁止运行脚本

PowerShell 执行策略限制，改用：

```powershell
npx.cmd vite
node .\node_modules\vite\bin\vite.js
```

### Q5：`npm run dev` 报 Missing script

本项目没有 `scripts` 字段。需要的话可自行添加：

```json
"scripts": { "dev": "vite", "build": "vite build" }
```

### Q6：离线环境能否运行

可以：

- `three` 优先使用 `public/vendor/three`（本地自托管）；
- `npx vite build` 会把 three 打包进产物；
- 只有既没有本地 vendor、又没联网时才会失败。

### Q7：如何换一个桥梁模型

替换 `bridge_output/30205080.geom.glb` 与对应 JSON/BIN，或在 `createBridgeHeatApp` 的 `options` 里指定新路径。传感器占位位置会按新包围盒自动重算。

### Q8：如何调整传感器大小

改 `options.sensorDiameterMm`（毫米）。若模型单位不是米，同时调整 `modelUnitToMeter`。

---

## 附录：函数索引

| 函数 | 行号 |
|---|---|
| `createBridgeHeatApp` | main.js:21 |
| `loadGLTF` | main.js:143 |
| `loadShaderFile` | main.js:162 |
| `calcModelRawBox` | main.js:173 |
| `fitCameraByRawBox` | main.js:186 |
| `resizeHandler` | main.js:210 |
| `formatLegendValue` | main.js:495 |
| `buildLegendGradient` | main.js:511 |
| `resetView` | main.js:1181 |
| `createViewResetButton` | main.js:1190 |
| `ensureTimeStepData` | main.js:1220 |
| `loadSavedFieldId` | main.js:1228 |
| `saveActiveField` | main.js:1240 |
| `getFieldOptions` | main.js:1252 |
| `switchField` | main.js:1264 |
| `loadSavedColorMap` | main.js:1279 |
| `saveColorMap` | main.js:1296 |
| `createHeatMaterial` | main.js:1309 |
| `disposeHeatMaterial` | main.js:1332 |
| `disposeTexture` | main.js:1350 |
| `disposeMaterial` | main.js:1361 |
| `disposeObject3D` | main.js:1379 |
| `disposeAllResources` | main.js:1394 |
| `switchColorMap` | main.js:1460 |
| `setHeatRange` | main.js:1473 |
| `loadHeatBin` | main.js:1504 |
| `applyHeatField` | main.js:1517 |
| `applyFieldFrame` | main.js:1558 |
| `loadTimeStep` | main.js:1571 |
| `initScene` | main.js:1604 |
| `animate` | main.js:1653 |

`SensorLayer`（类，main.js:234）：

| 方法 | 行号 |
|---|---|
| `constructor` | main.js:235 |
| `getRadius` | main.js:254 |
| `loadTemplate` | main.js:258 |
| `normalizeModel` | main.js:271 |
| `buildVisual` | main.js:284 |
| `buildDefaultSpecs` | main.js:303 |
| `createAnchor` | main.js:322 |
| `createDefault` | main.js:338 |
| `createFromSpecs` | main.js:342 |
| `clear` | main.js:347 |
| `findAnchor` | main.js:359 |
| `handleClick` | main.js:368 |
| `ensurePopup` | main.js:384 |
| `showPopup` | main.js:407 |
| `hidePopup` | main.js:446 |
| `dispose` | main.js:452 |

`LegendPanel`（类，main.js:523）：

| 方法 | 行号 |
|---|---|
| `constructor` | main.js:524 |
| `create` | main.js:558 |
| `dispose` | main.js:584 |
| `buildRoot` | main.js:620 |
| `buildTitle` | main.js:639 |
| `buildFieldRow` | main.js:678 |
| `buildColorPicker` | main.js:710 |
| `buildBar` | main.js:821 |
| `update` | main.js:854 |
| `syncFieldSelect` | main.js:878 |
| `setFieldDisabled` | main.js:895 |
| `updateTicks` | main.js:899 |
| `applyLayout` | main.js:949 |
| `setOptions` | main.js:992 |
| `getOptions` | main.js:1023 |
| `loadSettings` | main.js:1027 |
| `saveSettings` | main.js:1055 |
| `loadPosition` | main.js:1065 |
| `savePosition` | main.js:1079 |
| `applyPosition` | main.js:1087 |
| `resetPosition` | main.js:1102 |
| `clampPosition` | main.js:1112 |
| `makeDraggable` | main.js:1126 |
| `setPickerOpen` | main.js:1170 |

`colorMapUtil.js`：

| 函数 | 说明 |
|---|---|
| `loadColorMaps` | 读取色板 JSON |
| `setActiveMap` | 设置当前色板 |
| `getAllColorMaps` | 返回深拷贝 |
| `getActiveMapName` | 当前色板名 |
| `buildColorTexture` | 生成色板纹理（带缓存） |
| `disposeColorMapTextures` | 释放色板纹理 |

---

*文档结束。如需更新，请同步修改本文件与 `代码结构讲解稿.md`。*
