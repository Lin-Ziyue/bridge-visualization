import * as THREE from 'three';
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Box3, Vector3 } from 'three'

import {
    loadColorMaps,
    setActiveMap,
    buildColorTexture,
    disposeColorMapTextures,
    getAllColorMaps,
    getActiveMapName,
} from "./colorMapUtil.js";

/**
 * 创建一个可挂载、可销毁的热力图应用实例
 * 原生页面由 js/standalone.js 挂到 body；React 由组件在 useEffect 中挂到容器。
 * @param {HTMLElement} [container] 挂载容器
 * @returns {{dispose: Function, resize: Function, setColorMap: Function, loadTimeStep: Function, canvas: HTMLCanvasElement, scene: THREE.Scene}}
 */
export function createBridgeHeatApp(container = document.body, options = {}) {
    if (!container) throw new Error("createBridgeHeatApp 需要一个挂载容器");
    const initialWidth = container.clientWidth || window.innerWidth;
    const initialHeight = container.clientHeight || window.innerHeight;

    // ====================== 可覆盖配置 ======================
    // 部署环境不确定是否联网，路径默认相对本项目；React / 后端接入时通过 options 覆盖
    const config = {
        shaderDir: "./js/shaders",
        dataDir: "./bridge_output",
        colorMapUrl: "/colorMap.json",
        modelUrl: "./bridge_output/30205080.geom.glb",
        timeStepJson: "./bridge_output/30205080.1784464473837.json",
        fieldId: 0,
        sensorMode: "sphere",          // "sphere" | "glb"
        sensorDiameterMm: 30,          // 统一物理直径，毫米
        modelUnitToMeter: 1,           // 1 模型单位 = 1 米
        sensorModelUrl: "./models/sensor.glb",
        ...options,
    };



    const scene = new THREE.Scene();

    // ============ 新增统一变换中间层（之前约定核心结构）============
    const transform_wrapper = new THREE.Group();
    scene.add(transform_wrapper);

    // 1. 桥面模型根组（GPU上色层，仅存放原始GLB，自身无变换）
    const root_model = new THREE.Group();
    // 2. 标记物总根组
    const root_markers = new THREE.Group();
    // 2.1 静态传感器子层
    const group_sensor = new THREE.Group();
    // 2.2 预留动态小车子层（暂不启用，全部注释，未来扩展用）
    // const group_car = new THREE.Group();

    // 嵌套挂载
    root_markers.add(group_sensor);
    // root_markers.add(group_car);

    // 桥面、标记层平级挂载到统一变换中间层下，共享一套变换矩阵
    transform_wrapper.add(root_model);
    transform_wrapper.add(root_markers);


    // 全局缓存中间层缩放系数（视图适配用）
    let globalScaleRatio = 1;
    // 全局缓存桥梁原始包围盒计算结果，加载新桥梁时更新，resize直接复用
    let cachedBridgeBoxInfo = null;
    // 首次 fit 时锁定的相机到模型中心距离，resize 复用，避免用户缩放后画面跳变
    let cachedFitDistance = null;
    // ======================================================================

    // ====================== 【外部着色器文本缓存】新增全局变量 ======================
    let vertShaderText = "";
    let fragShaderText = "";
    let bridgeHeatMaterial = null;
    let currentFieldMin = 0;
    let currentFieldMax = 0;
    let currentFieldName = "";
    let currentFieldId = config.fieldId;
    let resourcesDisposed = false;
    let colorMapsCache = null;
    let timeStepDataCache = null;
    const disposedResources = new Set();

    // ====================== 传感器配置 ======================
    const SENSOR_MODE = config.sensorMode;
    const SENSOR_DIAMETER_MM = config.sensorDiameterMm;
    const MODEL_UNIT_TO_METER = config.modelUnitToMeter;
    const SENSOR_MODEL_URL = config.sensorModelUrl;

    const ACTIVE_MAP_STORAGE_KEY = "bridgeHeat.activeColorMap";
    const ACTIVE_FIELD_STORAGE_KEY = "bridgeHeat.activeFieldId";
    const LEGEND_SETTINGS_STORAGE_KEY = "bridgeHeat.legendSettings";
    const LEGEND_POSITION_STORAGE_KEY = "bridgeHeat.legendPosition";

    // 界面设置按窗口隔离：同一窗口刷新保留，新窗口/其他电脑不共享。
    // 不用 localStorage：它会被同一浏览器的所有窗口共享，新开窗口会带出旧配置。
    const uiStorage = {
        get(key) {
            try {
                return window.sessionStorage.getItem(key);
            } catch (e) {
                return null;
            }
        },
        set(key, value) {
            try {
                window.sessionStorage.setItem(key, value);
            } catch (e) {
                console.warn("保存界面设置失败：", e);
            }
        },
        remove(key) {
            try {
                window.sessionStorage.removeItem(key);
            } catch (e) {
                console.warn("清除界面设置失败：", e);
            }
        },
    };



    scene.background = new THREE.Color(0xffffff);

    const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 0, 3);
    const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

    const camera = new THREE.PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 1000);
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    camera.lookAt(DEFAULT_CAMERA_TARGET);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    //orbit controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;

    // 传感器层：状态、显示体、弹窗和点击拾取封装在 SensorLayer 类中
    let sensorLayer = null;

    // 色标面板：组件状态与 DOM 控制封装在 LegendPanel 类中
    let legendPanel = null;
    let fieldLoading = false;
    let viewResetButtonEl = null;

    const gltfLoader = new GLTFLoader();

    /**
     * 加载GLTF模型
     * @param {string} url 模型路径
     * @returns {Promise<THREE.Group>}
     * @throws {Error} 地址为空 / 加载失败抛出异常
     */
    function loadGLTF(url) {
        if (!url || url.trim() === "") {
            throw new Error("模型url不能为空");
        }
        return new Promise((resolve, reject) => {
            gltfLoader.load(
                url,
                (gltf) => resolve(gltf.scene),
                undefined,
                (error) => reject(error)
            );
        });
    }

    /**
     * 异步加载外部glsl着色文件
     * @param {string} filePath 着色器文件路径
     * @returns {string} 着色文本
     */
    async function loadShaderFile(filePath) {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`着色器${filePath}加载失败，HTTP${res.status}`);
        return await res.text();
    }

    /**
     * 仅计算模型原始包围盒，输入模型根组，返回盒、尺寸、中心
     * @param {THREE.Group} modelRoot root_model
     * @returns {{box:Box3, size:Vector3, center:Vector3}}
     */
    function calcModelRawBox(modelRoot) {
        const box = new Box3().setFromObject(modelRoot, true);
        const size = new Vector3();
        const center = new Vector3();
        box.getSize(size);
        box.getCenter(center);
        return { box, size, center };
    }

    /**
     * 根据预计算好的原始包围盒数据，更新transform_wrapper缩放与偏移
     * @param {Object} boxResult calcModelRawBox返回的包围盒结果
     */
    function fitCameraByRawBox(boxResult) {
        const { size, center } = boxResult;
        const maxOriginDimension = Math.max(size.x, size.y, size.z) || 1e-6;
        const centerWorld = center.clone();
        if (cachedFitDistance === null) {
            cachedFitDistance = centerWorld.distanceTo(camera.position);
        }
        const distance = cachedFitDistance;
        const halfVFOV = (camera.fov * Math.PI / 180) / 2;
        const visibleHalfHeight = Math.tan(halfVFOV) * distance;
        const visibleFullHeight = visibleHalfHeight * 2;
        const marginScale = 1.5;
        const targetMaxSize = visibleFullHeight * marginScale;

        // 重置中间层，防止偏移叠加漂移
        transform_wrapper.position.set(0, 0, 0);
        transform_wrapper.scale.set(1, 1, 1);

        globalScaleRatio = targetMaxSize / maxOriginDimension;
        transform_wrapper.scale.set(globalScaleRatio, globalScaleRatio, globalScaleRatio);
        const offset = center.clone().multiplyScalar(globalScaleRatio);
        transform_wrapper.position.sub(offset);
    }

    function resizeHandler() {
        const canvas = renderer.domElement;
        // 画布尺寸过小直接跳过，避免0宽高计算异常
        if (canvas.clientWidth < 20 || canvas.clientHeight < 20) return;

        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;
        camera.aspect = canvasWidth / canvasHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvasWidth, canvasHeight, false);

        // 缓存存在才执行适配，复用之前算好的包围盒，不遍历模型
        if (cachedBridgeBoxInfo) {
            fitCameraByRawBox(cachedBridgeBoxInfo);
        }
        orbitControls.update();
    }
    window.addEventListener('resize', resizeHandler);


    /**
     * 传感器层：锚点、显示体、模板、共享球体、弹窗和点击拾取
     * 状态和交互都收在这个类里，桥面/热力/色标不直接碰传感器内部。
     */
    class SensorLayer {
        constructor({ group, camera, canvas, container }) {
            this.group = group;
            this.camera = camera;
            this.canvas = canvas;
            this.container = container;

            this.list = [];
            this.template = null;
            this.assets = { geometry: null, material: null };
            this.popupEl = null;

            this.raycaster = new THREE.Raycaster();
            this.mouse = new THREE.Vector2();
            this.clickHandler = (event) => this.handleClick(event);
            this.canvas.addEventListener("click", this.clickHandler);
        }

        // ---------------------------------------------------------- 资源

        getRadius(diameterMm = SENSOR_DIAMETER_MM) {
            return (diameterMm / 1000) / 2 / MODEL_UNIT_TO_METER;
        }

        async loadTemplate() {
            if (SENSOR_MODE !== "glb") return null;
            try {
                const gltf = await loadGLTF(SENSOR_MODEL_URL);
                this.template = gltf.scene;
                return this.template;
            } catch (e) {
                console.warn("传感器模型加载失败，回退为小球：", e);
                this.template = null;
                return null;
            }
        }

        normalizeModel(root, diameterModel) {
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                root.scale.multiplyScalar(diameterModel / maxDim);
            }

            const scaledBox = new THREE.Box3().setFromObject(root);
            const center = scaledBox.getCenter(new THREE.Vector3());
            root.position.sub(center);
        }

        buildVisual(anchor) {
            const diameterMm = anchor.userData.diameterMm ?? SENSOR_DIAMETER_MM;
            const radius = this.getRadius(diameterMm);

            if (this.template) {
                const model = this.template.clone(true);
                this.normalizeModel(model, radius * 2);
                return model;
            }

            if (!this.assets.geometry) {
                this.assets.geometry = new THREE.SphereGeometry(radius, 16, 12);
                this.assets.material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            }
            return new THREE.Mesh(this.assets.geometry, this.assets.material);
        }

        // ---------------------------------------------------------- 创建

        buildDefaultSpecs(box) {
            if (!box) return [];
            const xMin = box.min.x;
            const xMax = box.max.x;
            const yMin = box.min.y;
            const yMax = box.max.y;
            const zMid = (box.min.z + box.max.z) / 2;
            const xMid = (xMin + xMax) / 2;

            return [
                { uid: "S-00", name: "传感器0", x: xMin, y: yMin, z: zMid },
                { uid: "S-01", name: "传感器1", x: xMax, y: yMin, z: zMid },
                { uid: "S-02", name: "传感器2", x: xMin, y: yMax, z: zMid },
                { uid: "S-03", name: "传感器3", x: xMax, y: yMax, z: zMid },
                { uid: "S-04", name: "传感器4", x: xMid, y: yMin, z: zMid },
                { uid: "S-05", name: "传感器5", x: xMid, y: yMax, z: zMid },
            ].map(spec => ({ ...spec, diameterMm: SENSOR_DIAMETER_MM }));
        }

        createAnchor(spec) {
            const anchor = new THREE.Group();
            anchor.position.set(spec.x, spec.y, spec.z);
            anchor.userData = {
                type: "sensor",
                uid: spec.uid,
                name: spec.name,
                diameterMm: spec.diameterMm ?? SENSOR_DIAMETER_MM,
                coordinateSystem: "bridge",
            };
            anchor.add(this.buildVisual(anchor));
            this.group.add(anchor);
            this.list.push(anchor);
            return anchor;
        }

        createDefault(box) {
            this.createFromSpecs(this.buildDefaultSpecs(box));
        }

        createFromSpecs(specs) {
            this.clear();
            specs.forEach(spec => this.createAnchor(spec));
        }

        clear() {
            if (this.group.children.length) {
                disposeObject3D(this.group);
                this.group.clear();
            }
            this.list = [];
            this.assets.geometry = null;
            this.assets.material = null;
        }

        // ---------------------------------------------------------- 交互

        findAnchor(object) {
            let node = object;
            while (node) {
                if (node.userData?.type === "sensor") return node;
                node = node.parent;
            }
            return null;
        }

        handleClick(event) {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.group.children, true);
            const anchor = intersects.length ? this.findAnchor(intersects[0].object) : null;

            if (anchor) {
                this.showPopup(anchor, event);
            } else {
                this.hidePopup();
            }
        }

        ensurePopup() {
            if (this.popupEl) return this.popupEl;

            const el = document.createElement("div");
            el.id = "sensor-popup";
            Object.assign(el.style, {
                position: "fixed",
                display: "none",
                minWidth: "220px",
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.96)",
                border: "1px solid #ccc",
                borderRadius: "6px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
                font: "13px/1.6 system-ui, sans-serif",
                color: "#222",
                zIndex: "1000",
            });
            this.container.appendChild(el);
            this.popupEl = el;
            return el;
        }

        showPopup(anchor, event) {
            const el = this.ensurePopup();
            const { uid, name, diameterMm } = anchor.userData;
            const { x, y, z } = anchor.position;

            el.replaceChildren();

            const title = document.createElement("div");
            title.style.fontWeight = "600";
            title.style.marginBottom = "4px";
            title.textContent = `${name} (${uid})`;
            el.appendChild(title);

            const coord = document.createElement("div");
            coord.textContent = `模型坐标：X ${x.toFixed(3)}  Y ${y.toFixed(3)}  Z ${z.toFixed(3)}`;
            el.appendChild(coord);

            const size = document.createElement("div");
            size.textContent = `直径：${diameterMm} mm`;
            el.appendChild(size);

            const close = document.createElement("button");
            close.type = "button";
            close.textContent = "关闭";
            close.style.marginTop = "8px";
            close.style.cursor = "pointer";
            close.addEventListener("click", () => this.hidePopup());
            el.appendChild(close);

            const margin = 12;
            const popupWidth = 260;
            const popupHeight = 130;
            const left = Math.min(event.clientX + margin, window.innerWidth - popupWidth);
            const top = Math.min(event.clientY + margin, window.innerHeight - popupHeight);
            el.style.left = `${Math.max(margin, left)}px`;
            el.style.top = `${Math.max(margin, top)}px`;
            el.style.display = "block";
        }

        hidePopup() {
            if (this.popupEl) this.popupEl.style.display = "none";
        }

        // ---------------------------------------------------------- 释放

        dispose() {
            this.canvas.removeEventListener("click", this.clickHandler);

            if (this.group.children.length) {
                disposeObject3D(this.group);
                this.group.clear();
            }
            if (this.template) {
                disposeObject3D(this.template);
                this.template = null;
            }
            if (this.assets.geometry && !disposedResources.has(this.assets.geometry)) {
                disposedResources.add(this.assets.geometry);
                this.assets.geometry.dispose();
            }
            if (this.assets.material && !disposedResources.has(this.assets.material)) {
                disposedResources.add(this.assets.material);
                this.assets.material.dispose();
            }
            if (this.popupEl) {
                this.popupEl.remove();
                this.popupEl = null;
            }

            this.list = [];
            this.assets.geometry = null;
            this.assets.material = null;
        }
    }

    sensorLayer = new SensorLayer({
        group: group_sensor,
        camera,
        canvas: renderer.domElement,
        container,
    });


    /**
     * 色标数值格式化：极小值用科学计数法，普通值保留 4 位有效数字
     * @param {number} value
     * @returns {string}
     */
    function formatLegendValue(value) {
        if (!Number.isFinite(value)) return "-";
        if (value === 0) return "0";
        const abs = Math.abs(value);
        if (abs >= 0.001 && abs < 10000) {
            return Number(value.toPrecision(4)).toString();
        }
        return value.toExponential(2);
    }

    /**
     * 生成水平色带 CSS 渐变
     * @param {Object} map 色板对象
     * @param {string} [direction] 渐变方向
     * @returns {string}
     */
    function buildLegendGradient(map, direction = "to right") {
        const stops = map.stops.slice().sort((a, b) => a.value - b.value);
        const list = stops
            .map(s => `rgb(${s.r}, ${s.g}, ${s.b}) ${(s.value * 100).toFixed(2)}%`)
            .join(", ");
        return `linear-gradient(${direction}, ${list})`;
    }

    /**
     * 色标面板：把「色板选择器 + Field 下拉 + 色条 + 刻度 + 拖动 + 设置持久化」
     * 的状态和控制收进一个组件类。只依赖工厂闭包里的数据（色板、当前场、当前值域）。
     */
    class LegendPanel {
        constructor() {
            this.settings = {
                orientation: "horizontal",
                defaultColorMap: "viridis",
                tickCount: 3,
                showTickMarks: true,
                barLength: null,
                barThickness: 14,
            };

            this.el = null;
            this.barEl = null;
            this.titleEl = null;
            this.titleTextEl = null;
            this.bodyEl = null;
            this.barWrapEl = null;
            this.tickMarksEl = null;
            this.ticksEl = null;
            this.pickerButtonEl = null;
            this.pickerPanelEl = null;
            this.pickerNameEl = null;
            this.pickerPreviewEl = null;
            this.fieldSelectEl = null;
            this.optionEls = new Map();

            this.pickerOpen = false;
            this.position = null;
            this.outsideClickHandler = null;
            this.resizeHandler = null;
            this.dragState = null;
        }

        // ---------------------------------------------------------- 生命周期

        create() {
            if (this.el) return;
            const maps = colorMapsCache || getAllColorMaps();
            if (!maps.length) return;

            this.buildRoot();
            this.buildTitle();
            this.buildFieldRow();
            this.buildColorPicker(maps);
            this.buildBar();

            this.outsideClickHandler = () => this.setPickerOpen(false);
            document.addEventListener("click", this.outsideClickHandler);

            container.appendChild(this.el);

            this.position = this.loadPosition();
            this.applyPosition();
            this.applyLayout();
            this.update();
            this.makeDraggable();

            this.resizeHandler = () => this.clampPosition();
            window.addEventListener("resize", this.resizeHandler);
        }

        dispose() {
            if (this.outsideClickHandler) {
                document.removeEventListener("click", this.outsideClickHandler);
                this.outsideClickHandler = null;
            }
            if (this.resizeHandler) {
                window.removeEventListener("resize", this.resizeHandler);
                this.resizeHandler = null;
            }
            if (this.dragState) {
                window.removeEventListener("pointermove", this.dragState.onMove);
                window.removeEventListener("pointerup", this.dragState.onUp);
                this.dragState = null;
            }
            if (this.el) this.el.remove();

            this.el = null;
            this.barEl = null;
            this.titleEl = null;
            this.titleTextEl = null;
            this.bodyEl = null;
            this.barWrapEl = null;
            this.tickMarksEl = null;
            this.ticksEl = null;
            this.pickerButtonEl = null;
            this.pickerPanelEl = null;
            this.pickerNameEl = null;
            this.pickerPreviewEl = null;
            this.fieldSelectEl = null;
            this.optionEls.clear();
            this.pickerOpen = false;
            this.position = null;
        }

        // ---------------------------------------------------------- 构建 DOM

        buildRoot() {
            this.el = document.createElement("div");
            this.el.id = "heat-legend";
            Object.assign(this.el.style, {
                position: "fixed",
                right: "18px",
                bottom: "18px",
                width: "280px",
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.96)",
                border: "1px solid #ddd",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                font: "12px/1.5 system-ui, sans-serif",
                color: "#222",
                zIndex: "900",
            });
        }

        buildTitle() {
            this.titleEl = document.createElement("div");
            Object.assign(this.titleEl.style, {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
                fontWeight: "600",
            });

            this.titleTextEl = document.createElement("span");
            Object.assign(this.titleTextEl.style, {
                flex: "1",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            });
            this.titleEl.appendChild(this.titleTextEl);

            const resetPosBtn = document.createElement("button");
            resetPosBtn.type = "button";
            resetPosBtn.textContent = "Reset Pos.";
            resetPosBtn.title = "重置到右下角";
            Object.assign(resetPosBtn.style, {
                padding: "1px 6px",
                border: "1px solid #bbb",
                borderRadius: "3px",
                background: "#fff",
                color: "#333",
                cursor: "pointer",
                font: "11px/1.4 system-ui, sans-serif",
                flex: "0 0 auto",
            });
            resetPosBtn.addEventListener("click", () => this.resetPosition());
            this.titleEl.appendChild(resetPosBtn);

            this.el.appendChild(this.titleEl);
        }

        buildFieldRow() {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
            });

            const label = document.createElement("span");
            label.textContent = "Field";
            label.style.color = "#666";
            label.style.flex = "0 0 auto";

            this.fieldSelectEl = document.createElement("select");
            Object.assign(this.fieldSelectEl.style, {
                flex: "1",
                padding: "3px 4px",
                border: "1px solid #bbb",
                borderRadius: "3px",
                background: "#fff",
                font: "inherit",
                color: "inherit",
            });
            this.fieldSelectEl.addEventListener("change", () => {
                switchField(Number(this.fieldSelectEl.value));
            });

            row.append(label, this.fieldSelectEl);
            this.el.appendChild(row);
        }

        buildColorPicker(maps) {
            const picker = document.createElement("div");
            picker.style.position = "relative";
            picker.style.marginBottom = "8px";

            this.pickerButtonEl = document.createElement("button");
            this.pickerButtonEl.type = "button";
            Object.assign(this.pickerButtonEl.style, {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "4px 6px",
                border: "1px solid #bbb",
                borderRadius: "4px",
                background: "#fff",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
            });

            this.pickerNameEl = document.createElement("span");
            this.pickerNameEl.style.minWidth = "64px";
            this.pickerNameEl.style.textAlign = "left";

            // 预览条硬性规则：只在选择面板展开时显示
            this.pickerPreviewEl = document.createElement("span");
            Object.assign(this.pickerPreviewEl.style, {
                flex: "1",
                height: "10px",
                borderRadius: "2px",
                border: "1px solid #ccc",
                display: "none",
            });

            const caret = document.createElement("span");
            caret.textContent = "▾";
            caret.style.color = "#666";

            this.pickerButtonEl.append(this.pickerNameEl, this.pickerPreviewEl, caret);
            picker.appendChild(this.pickerButtonEl);

            this.pickerPanelEl = document.createElement("div");
            Object.assign(this.pickerPanelEl.style, {
                position: "absolute",
                left: "0",
                right: "0",
                bottom: "calc(100% + 4px)",
                maxHeight: "240px",
                overflowY: "auto",
                padding: "4px",
                background: "#fff",
                border: "1px solid #bbb",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                display: "none",
                zIndex: "1100",
            });

            maps.forEach(map => {
                const option = document.createElement("button");
                option.type = "button";
                option.dataset.name = map.name;
                Object.assign(option.style, {
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "4px 6px",
                    border: "1px solid transparent",
                    borderRadius: "3px",
                    background: "transparent",
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                    textAlign: "left",
                });

                const name = document.createElement("span");
                name.textContent = map.label || map.name;
                name.style.minWidth = "64px";

                const strip = document.createElement("span");
                Object.assign(strip.style, {
                    flex: "1",
                    height: "10px",
                    borderRadius: "2px",
                    border: "1px solid #ccc",
                    display: "block",
                    background: buildLegendGradient(map),
                });

                option.append(name, strip);
                option.addEventListener("click", () => {
                    switchColorMap(map.name);
                    this.setPickerOpen(false);
                });
                this.pickerPanelEl.appendChild(option);
                this.optionEls.set(map.name, option);
            });

            picker.appendChild(this.pickerPanelEl);
            this.el.appendChild(picker);

            this.pickerButtonEl.addEventListener("click", (event) => {
                event.stopPropagation();
                this.setPickerOpen(!this.pickerOpen);
            });
            this.pickerPanelEl.addEventListener("click", (event) => event.stopPropagation());
        }

        buildBar() {
            this.bodyEl = document.createElement("div");
            this.el.appendChild(this.bodyEl);

            this.barWrapEl = document.createElement("div");
            this.barWrapEl.style.position = "relative";
            this.bodyEl.appendChild(this.barWrapEl);

            this.barEl = document.createElement("div");
            Object.assign(this.barEl.style, {
                width: "100%",
                height: "100%",
                borderRadius: "3px",
                border: "1px solid #bbb",
            });
            this.barWrapEl.appendChild(this.barEl);

            this.tickMarksEl = document.createElement("div");
            Object.assign(this.tickMarksEl.style, {
                position: "absolute",
                inset: "0",
                pointerEvents: "none",
                overflow: "visible",
            });
            this.barWrapEl.appendChild(this.tickMarksEl);

            this.ticksEl = document.createElement("div");
            this.ticksEl.style.whiteSpace = "nowrap";
            this.bodyEl.appendChild(this.ticksEl);
        }

        // ---------------------------------------------------------- 渲染

        update() {
            if (!this.el) return;

            const maps = colorMapsCache || getAllColorMaps();
            const activeName = getActiveMapName();
            const map = maps.find(m => m.name === activeName) || maps[0];
            if (!map) return;

            const vertical = this.settings.orientation === "vertical";
            this.barEl.style.background = buildLegendGradient(map, vertical ? "to top" : "to right");
            this.pickerPreviewEl.style.background = buildLegendGradient(map, "to right");
            this.pickerNameEl.textContent = map.label || map.name;

            this.titleTextEl.textContent = currentFieldName || "热力值";
            this.syncFieldSelect();
            this.updateTicks();

            this.optionEls.forEach((option, name) => {
                const active = name === activeName;
                option.style.background = active ? "#e8f1ff" : "transparent";
                option.style.borderColor = active ? "#7aa7e0" : "transparent";
            });
        }

        syncFieldSelect() {
            if (!this.fieldSelectEl) return;
            const fields = getFieldOptions();
            if (!fields.length) return;

            if (this.fieldSelectEl.options.length !== fields.length) {
                this.fieldSelectEl.replaceChildren();
                fields.forEach(field => {
                    const option = document.createElement("option");
                    option.value = String(field.id);
                    option.textContent = field.name;
                    this.fieldSelectEl.appendChild(option);
                });
            }
            this.fieldSelectEl.value = String(currentFieldId);
        }

        setFieldDisabled(disabled) {
            if (this.fieldSelectEl) this.fieldSelectEl.disabled = disabled;
        }

        updateTicks() {
            if (!this.ticksEl || !this.tickMarksEl) return;
            const count = this.settings.tickCount;
            const vertical = this.settings.orientation === "vertical";
            const min = currentFieldMin;
            const max = currentFieldMax;

            this.ticksEl.replaceChildren();
            this.tickMarksEl.replaceChildren();
            this.tickMarksEl.style.display = this.settings.showTickMarks ? "block" : "none";
            this.ticksEl.style.fontSize = !vertical && count > 5 ? "10px" : "12px";
            this.ticksEl.style.marginTop = vertical ? "0" : (this.settings.showTickMarks ? "8px" : "3px");

            for (let i = 0; i < count; i++) {
                const ratio = count <= 1 ? 0 : i / (count - 1);
                const value = min + (max - min) * ratio;

                const label = document.createElement("span");
                label.textContent = formatLegendValue(value);
                this.ticksEl.appendChild(label);

                if (!this.settings.showTickMarks) continue;

                const mark = document.createElement("span");
                Object.assign(mark.style, {
                    position: "absolute",
                    background: "#333",
                    pointerEvents: "none",
                });
                if (vertical) {
                    Object.assign(mark.style, {
                        right: "-6px",
                        top: `${(1 - ratio) * 100}%`,
                        width: "6px",
                        height: "2px",
                        transform: "translateY(-50%)",
                    });
                } else {
                    Object.assign(mark.style, {
                        left: `${ratio * 100}%`,
                        bottom: "-6px",
                        width: "2px",
                        height: "6px",
                        transform: "translateX(-50%)",
                    });
                }
                this.tickMarksEl.appendChild(mark);
            }
        }

        applyLayout() {
            if (!this.bodyEl || !this.barWrapEl || !this.ticksEl) return;
            const vertical = this.settings.orientation === "vertical";
            const length = this.settings.barLength;
            const thickness = this.settings.barThickness;
            const horizontalLength = length ? `${length}px` : "100%";
            const verticalLength = length ? `${length}px` : "190px";

            this.el.style.width = vertical
                ? "280px"
                : `${Math.max(280, length ? length + 24 : 280)}px`;

            Object.assign(this.bodyEl.style, {
                display: "flex",
                flexDirection: vertical ? "row" : "column",
                alignItems: vertical ? "stretch" : "flex-start",
                gap: vertical ? "8px" : "0",
                height: vertical ? verticalLength : "auto",
            });

            Object.assign(this.barWrapEl.style, {
                width: vertical ? `${thickness}px` : horizontalLength,
                height: vertical ? verticalLength : `${thickness}px`,
                flex: vertical ? "0 0 auto" : "none",
            });

            Object.assign(this.ticksEl.style, {
                display: "flex",
                flex: vertical ? "1" : "none",
                flexDirection: vertical ? "column-reverse" : "row",
                justifyContent: "space-between",
                alignItems: vertical ? "flex-start" : "center",
                width: vertical ? "auto" : horizontalLength,
                height: vertical ? verticalLength : "auto",
                marginTop: vertical ? "0" : "3px",
                textAlign: vertical ? "left" : "center",
            });

            this.clampPosition();
        }

        // ---------------------------------------------------------- 设置

        setOptions(options = {}) {
            if (options.orientation === "horizontal" || options.orientation === "vertical") {
                this.settings.orientation = options.orientation;
            }
            if (typeof options.defaultColorMap === "string") {
                const exists = (colorMapsCache || getAllColorMaps()).some(m => m.name === options.defaultColorMap);
                if (exists) {
                    this.settings.defaultColorMap = options.defaultColorMap;
                    switchColorMap(options.defaultColorMap);
                }
            }
            if (Number.isInteger(options.tickCount)) {
                this.settings.tickCount = Math.min(10, Math.max(2, options.tickCount));
            }
            if (typeof options.showTickMarks === "boolean") {
                this.settings.showTickMarks = options.showTickMarks;
            }
            if (options.barLength === null || Number.isFinite(options.barLength)) {
                this.settings.barLength = options.barLength === null
                    ? null
                    : Math.min(600, Math.max(40, options.barLength));
            }
            if (Number.isFinite(options.barThickness)) {
                this.settings.barThickness = Math.min(60, Math.max(6, options.barThickness));
            }
            this.saveSettings();
            this.applyLayout();
            this.update();
            return this.getOptions();
        }

        getOptions() {
            return { ...this.settings };
        }

        loadSettings() {
            try {
                const raw = uiStorage.get(LEGEND_SETTINGS_STORAGE_KEY);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved.orientation === "horizontal" || saved.orientation === "vertical") {
                    this.settings.orientation = saved.orientation;
                }
                if (typeof saved.defaultColorMap === "string") {
                    this.settings.defaultColorMap = saved.defaultColorMap;
                }
                if (Number.isInteger(saved.tickCount)) {
                    this.settings.tickCount = Math.min(10, Math.max(2, saved.tickCount));
                }
                if (typeof saved.showTickMarks === "boolean") {
                    this.settings.showTickMarks = saved.showTickMarks;
                }
                if (saved.barLength === null || (Number.isFinite(saved.barLength) && saved.barLength >= 40 && saved.barLength <= 600)) {
                    this.settings.barLength = saved.barLength;
                }
                if (Number.isFinite(saved.barThickness)) {
                    this.settings.barThickness = Math.min(60, Math.max(6, saved.barThickness));
                }
            } catch (e) {
                console.warn("读取色标设置失败：", e);
            }
        }

        saveSettings() {
            try {
                uiStorage.set(LEGEND_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
            } catch (e) {
                console.warn("保存色标设置失败：", e);
            }
        }

        // ---------------------------------------------------------- 位置

        loadPosition() {
            try {
                const raw = uiStorage.get(LEGEND_POSITION_STORAGE_KEY);
                if (!raw) return null;
                const pos = JSON.parse(raw);
                if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
                    return { left: pos.left, top: pos.top };
                }
            } catch (e) {
                console.warn("读取色标位置失败：", e);
            }
            return null;
        }

        savePosition(left, top) {
            try {
                uiStorage.set(LEGEND_POSITION_STORAGE_KEY, JSON.stringify({ left, top }));
            } catch (e) {
                console.warn("保存色标位置失败：", e);
            }
        }

        applyPosition() {
            if (!this.el) return;
            if (!this.position) {
                this.el.style.left = "auto";
                this.el.style.top = "auto";
                this.el.style.right = "18px";
                this.el.style.bottom = "18px";
                return;
            }
            this.el.style.left = `${this.position.left}px`;
            this.el.style.top = `${this.position.top}px`;
            this.el.style.right = "auto";
            this.el.style.bottom = "auto";
        }

        resetPosition() {
            this.position = null;
            try {
                uiStorage.remove(LEGEND_POSITION_STORAGE_KEY);
            } catch (e) {
                console.warn("清除色标位置失败：", e);
            }
            this.applyPosition();
        }

        clampPosition() {
            if (!this.el || !this.position) return;
            const rect = this.el.getBoundingClientRect();
            const maxLeft = Math.max(0, window.innerWidth - rect.width);
            const maxTop = Math.max(0, window.innerHeight - rect.height);
            const left = Math.min(Math.max(0, this.position.left), maxLeft);
            const top = Math.min(Math.max(0, this.position.top), maxTop);
            if (left !== this.position.left || top !== this.position.top) {
                this.position = { left, top };
                this.applyPosition();
                this.savePosition(left, top);
            }
        }

        makeDraggable() {
            if (!this.el || !this.titleEl) return;
            this.titleEl.style.cursor = "move";
            this.titleEl.style.userSelect = "none";
            this.titleEl.title = "拖动色标面板";

            this.el.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                if (event.target.closest("button, select, input, textarea, a")) return;
                if (this.pickerPanelEl?.contains(event.target)) return;
                event.preventDefault();

                const rect = this.el.getBoundingClientRect();
                const startX = event.clientX;
                const startY = event.clientY;
                const startLeft = rect.left;
                const startTop = rect.top;
                const maxLeft = Math.max(0, window.innerWidth - rect.width);
                const maxTop = Math.max(0, window.innerHeight - rect.height);

                this.position = { left: startLeft, top: startTop };
                this.applyPosition();

                const onMove = (e) => {
                    const left = Math.min(Math.max(0, startLeft + e.clientX - startX), maxLeft);
                    const top = Math.min(Math.max(0, startTop + e.clientY - startY), maxTop);
                    this.position = { left, top };
                    this.applyPosition();
                };
                const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    this.dragState = null;
                    if (this.position) this.savePosition(this.position.left, this.position.top);
                };

                this.dragState = { onMove, onUp };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
            });
        }

        // ---------------------------------------------------------- 选择器

        setPickerOpen(open) {
            this.pickerOpen = open;
            if (this.pickerPanelEl) this.pickerPanelEl.style.display = open ? "block" : "none";
            if (this.pickerPreviewEl) this.pickerPreviewEl.style.display = open ? "block" : "none";
        }
    }


    /**
     * 相机回到默认视角（Three.js 初始位置 + 默认 OrbitControls 目标）
     */
    function resetView() {
        camera.position.copy(DEFAULT_CAMERA_POSITION);
        orbitControls.target.copy(DEFAULT_CAMERA_TARGET);
        orbitControls.update();
    }

    /**
     * 创建 Reset View 按钮
     */
    function createViewResetButton() {
        if (viewResetButtonEl) return;

        viewResetButtonEl = document.createElement("button");
        viewResetButtonEl.type = "button";
        viewResetButtonEl.textContent = "Reset View";
        viewResetButtonEl.title = "回到默认视角";
        Object.assign(viewResetButtonEl.style, {
            position: "fixed",
            left: "18px",
            top: "18px",
            padding: "6px 10px",
            border: "1px solid #bbb",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.96)",
            color: "#222",
            cursor: "pointer",
            font: "12px/1.4 system-ui, sans-serif",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
            zIndex: "950",
        });
        viewResetButtonEl.addEventListener("click", resetView);
        container.appendChild(viewResetButtonEl);
    }

    /**
     * 读取并缓存时序 JSON，切换场时避免重复请求
     * @param {string} jsonUrl
     * @returns {Promise<Object>}
     */
    async function ensureTimeStepData(jsonUrl) {
        if (timeStepDataCache) return timeStepDataCache;
        const res = await fetch(jsonUrl);
        if (!res.ok) throw new Error(`时序文件${jsonUrl}不存在，HTTP${res.status}`);
        timeStepDataCache = await res.json();
        return timeStepDataCache;
    }

    function loadSavedFieldId() {
        try {
            const raw = uiStorage.get(ACTIVE_FIELD_STORAGE_KEY);
            if (raw === null) return null;
            const fid = Number(raw);
            return Number.isInteger(fid) ? fid : null;
        } catch (e) {
            console.warn("读取场记忆失败：", e);
            return null;
        }
    }

    function saveActiveField(fid) {
        try {
            uiStorage.set(ACTIVE_FIELD_STORAGE_KEY, String(fid));
        } catch (e) {
            console.warn("保存场选择失败：", e);
        }
    }

    /**
     * 当前时序 JSON 里所有可选场
     * @returns {Array<{id:number,name:string}>}
     */
    function getFieldOptions() {
        if (!timeStepDataCache) return [];
        return Object.entries(timeStepDataCache.field_map).map(([id, field]) => ({
            id: Number(id),
            name: field.field_name || `field_${id}`,
        }));
    }

    /**
     * 切换物理场：重新读取对应 bin 并刷新热力图与色标
     * @param {number} fid
     */
    async function switchField(fid) {
        if (!Number.isInteger(fid) || fieldLoading) return;
        fieldLoading = true;
        legendPanel?.setFieldDisabled(true);
        try {
            await loadTimeStep(config.timeStepJson, fid);
        } finally {
            fieldLoading = false;
            legendPanel?.setFieldDisabled(false);
        }
    }

    /**
     * 读取上次选择的色板；没有记录时使用默认色板
     */
    function loadSavedColorMap() {
        try {
            const saved = uiStorage.get(ACTIVE_MAP_STORAGE_KEY) || (legendPanel?.settings.defaultColorMap || "viridis");
            if (!saved) return;
            const exists = getAllColorMaps().some(map => map.name === saved);
            if (exists) {
                setActiveMap(saved);
            }
        } catch (e) {
            console.warn("读取色板记忆失败：", e);
        }
    }

    /**
     * 记住当前色板选择
     * @param {string} name
     */
    function saveColorMap(name) {
        try {
            uiStorage.set(ACTIVE_MAP_STORAGE_KEY, name);
        } catch (e) {
            console.warn("保存色板选择失败：", e);
        }
    }

    //============================================================================

    /**
     * 创建热力Shader材质，依赖外部加载完成的着色文本 + 色板工具
     */
    function createHeatMaterial() {
        if (resourcesDisposed) return;
        // 色板在 CPU 端采样成 256×1 纹理，shader 只做一次 texture2D 查询
        const colorTexture = buildColorTexture();
        // 重建前释放旧材质与旧纹理，避免切换色板时泄漏
        disposeHeatMaterial();

        bridgeHeatMaterial = new THREE.ShaderMaterial({
            vertexShader: vertShaderText,
            fragmentShader: fragShaderText,
            uniforms: {
                uValMin: { value: currentFieldMin },
                uValMax: { value: currentFieldMax },
                uColorMap: { value: colorTexture }
            },
            side: THREE.DoubleSide
        });
    }

    /**
     * 释放热力材质及其色板纹理
     * 注意：material.dispose() 不会释放 uniform 里的 Texture
     */
    function disposeHeatMaterial() {
        if (!bridgeHeatMaterial) return;
        if (!disposedResources.has(bridgeHeatMaterial)) {
            disposedResources.add(bridgeHeatMaterial);
            bridgeHeatMaterial.dispose();
        }
        bridgeHeatMaterial = null;
    }

    /**
     * 材质上常见的贴图槽位；只遍历这些，避免 for...in 范围过大
     */
    const TEXTURE_SLOTS = [
        "map", "normalMap", "bumpMap", "emissiveMap", "roughnessMap",
        "metalnessMap", "alphaMap", "aoMap", "lightMap", "displacementMap",
        "specularMap", "envMap",
    ];

    function disposeTexture(texture) {
        if (texture && texture.isTexture && !disposedResources.has(texture)) {
            disposedResources.add(texture);
            texture.dispose();
        }
    }

    /**
     * 释放材质及其直接挂载的贴图
     * @param {THREE.Material|THREE.Material[]|null} material
     */
    function disposeMaterial(material) {
        if (!material) return;
        const mats = Array.isArray(material) ? material : [material];
        mats.forEach(mat => {
            if (!mat || disposedResources.has(mat)) return;
            disposedResources.add(mat);
            for (const key of TEXTURE_SLOTS) {
                const value = mat[key];
                if (value && value.isTexture) disposeTexture(value);
            }
            mat.dispose();
        });
    }

    /**
     * 递归释放 Object3D 下的几何体、材质与贴图
     * @param {THREE.Object3D} root
     */
    function disposeObject3D(root) {
        root.traverse(obj => {
            if (!obj.isMesh) return;
            if (obj.geometry && !disposedResources.has(obj.geometry)) {
                disposedResources.add(obj.geometry);
                obj.geometry.dispose();
            }
            disposeMaterial(obj.material);
        });
    }

    /**
     * 释放全部 GPU/CPU 资源；React 迁移时在组件卸载阶段调用
     * 可重复调用，第二次直接返回
     */
    function disposeAllResources() {
        if (resourcesDisposed) return;
        resourcesDisposed = true;

        // 1. 先停渲染循环，避免销毁后 animate 继续持有 scene/camera
        renderer.setAnimationLoop(null);

        // 2. 移除事件监听与控制器
        window.removeEventListener("resize", resizeHandler);
        orbitControls.dispose();

        // 3. 释放几何体、材质与贴图
        disposeObject3D(root_model);
        disposeObject3D(root_markers);

        // 传感器层
        if (sensorLayer) {
            sensorLayer.dispose();
            sensorLayer = null;
        }
        if (viewResetButtonEl) {
            viewResetButtonEl.remove();
            viewResetButtonEl = null;
        }

        // 色标面板
        if (legendPanel) {
            legendPanel.dispose();
            legendPanel = null;
        }

        // 4. 释放热力材质与色板纹理（disposeObject3D 只释放了材质本体）
        disposeHeatMaterial();
        disposeColorMapTextures();

        // 5. 断开场景引用，便于 GC
        root_model.clear();
        group_sensor.clear();
        root_markers.clear();
        transform_wrapper.clear();
        scene.clear();
        scene.background = null;

        // 6. 清空业务缓存，避免下次挂载读到旧状态
        cachedBridgeBoxInfo = null;
        cachedFitDistance = null;
        colorMapsCache = null;
        timeStepDataCache = null;
        globalScaleRatio = 1;
        currentFieldMin = 0;
        currentFieldMax = 0;
        currentFieldName = "";
        currentFieldId = config.fieldId;
        vertShaderText = "";
        fragShaderText = "";

        // 7. 移除 canvas 并释放 WebGL 上下文（反复挂载时防止上下文耗尽）
        renderer.domElement.remove();
        renderer.dispose();
        renderer.forceContextLoss?.();
    }

    /**
     * 切换色板入口
     * @param {string} mapName viridis / coolwarm
     */
    function switchColorMap(mapName) {
        setActiveMap(mapName);
        saveColorMap(mapName);
        createHeatMaterial();
        root_model.traverse(mesh => {
            if (mesh.isMesh) mesh.material = bridgeHeatMaterial;
        });
        legendPanel?.update();
    }

    /**
     * 更新全场数值极值
     */
    function setHeatRange(min, max) {
        let realMin = min;
        let realMax = max;
        const diff = Math.abs(max - min);
        // 极小极差兜底，适配1e-6这种差值极小数据
        const tinyDiffThreshold = 1e-6;
        if (diff < tinyDiffThreshold) {
            const mid = (min + max) / 2;
            const expandSpan = tinyDiffThreshold * 2;
            realMin = mid - expandSpan;
            realMax = mid + expandSpan;
        }
        // 除0终极兜底
        if (Math.abs(realMax - realMin) < 1e-12) {
            realMin -= 1;
            realMax += 1;
        }
        currentFieldMin = realMin;
        currentFieldMax = realMax;
        if (bridgeHeatMaterial) {
            bridgeHeatMaterial.uniforms.uValMin.value = realMin;
            bridgeHeatMaterial.uniforms.uValMax.value = realMax;
        }
        legendPanel?.update();
    }

    /**
     * 加载后端bin二进制热力数据，只负责取数，不碰材质
     * @param {string} binUrl bin文件地址
     * @returns {Promise<Float32Array>} 顶点热力数组
     */
    async function loadHeatBin(binUrl) {
        const res = await fetch(binUrl);
        if (!res.ok) throw new Error(`热力数据${binUrl}不存在，HTTP${res.status}`);
        const buf = await res.arrayBuffer();
        return new Float32Array(buf);
    }

    /**
     * 把一帧热力数据应用到模型：定值域 → 建材质 → 换属性 → 换材质
     * @param {number} min 全场最小值
     * @param {number} max 全场最大值
     * @param {Float32Array|null} binFloat32 顶点热力数组，null 时全部补 0
     */
    function applyHeatField(min, max, binFloat32) {
        if (resourcesDisposed) return;
        // 1. 先定值域（currentFieldMin/Max 与已有材质的 uniform 同步更新）
        setHeatRange(min, max);
        // 2. 再建材质，保证 uniform 取到正确值域
        if (!bridgeHeatMaterial) createHeatMaterial();

        let offset = 0;
        root_model.traverse(mesh => {
            if (!mesh.isMesh) return;
            const geo = mesh.geometry;
            const count = geo.attributes.position.count;
            // 3. 按顶点数切片；数据不足时补 0，避免多个 primitive 复用同一段数据
            let slice;
            if (binFloat32 && offset + count <= binFloat32.length) {
                slice = binFloat32.subarray(offset, offset + count);
                offset += count;
            } else {
                slice = new Float32Array(count);
            }
            // 4. 长度一致则复用已有属性，避免重复加载时反复建 BufferAttribute
            const attr = geo.getAttribute("aHeatValue");
            if (attr && attr.array.length === count) {
                attr.array.set(slice);
                attr.needsUpdate = true;
            } else {
                geo.setAttribute("aHeatValue", new THREE.BufferAttribute(slice, 1));
            }
            // 5. 先释放 glTF 自带材质（含贴图），再换热力材质
            if (mesh.material !== bridgeHeatMaterial) {
                disposeMaterial(mesh.material);
            }
            mesh.material = bridgeHeatMaterial;
        });
    }

    /**
     * 应用一帧模型场数据（静态 loader 和后续 SSE 共用入口）
     * 参考方案文档：Go 拉取 → converter → data_bus → 前端；帧结构即总线里的一帧
     * @param {{modelId?: string, fieldId?: number, fieldName?: string, valueMin?: number, valueMax?: number, values?: Float32Array|null, timestamp?: number}} frame
     */
    function applyFieldFrame(frame = {}) {
        if (resourcesDisposed) return;
        if (frame.fieldId !== undefined) currentFieldId = frame.fieldId;
        currentFieldName = frame.fieldName || (frame.fieldId !== undefined ? `field_${frame.fieldId}` : "热力值");
        applyHeatField(frame.valueMin ?? -1, frame.valueMax ?? 1, frame.values ?? null);
        legendPanel?.update();
    }

    /**
     * 加载仿真时序json，自动更新值域并加载对应bin
     * @param {string} jsonUrl 时序元数据地址
     * @param {number} fid 物理场编号
     */
    async function loadTimeStep(jsonUrl, fid = config.fieldId) {
        if (resourcesDisposed) return;
        try {
            const timeData = await ensureTimeStepData(jsonUrl);
            const fieldMap = timeData.field_map;

            // 保存的场可能已被删除，回退到配置场 / 第一个可用场
            if (!fieldMap[String(fid)]) fid = config.fieldId;
            if (!fieldMap[String(fid)]) fid = Number(Object.keys(fieldMap)[0]);

            const field = fieldMap[String(fid)];
            if (!field) throw new Error(`时序文件${jsonUrl}没有可用场`);

            currentFieldId = fid;
            const binUrl = jsonUrl.replace(".json", `.${fid}.bin`);
            const heatArr = await loadHeatBin(binUrl);
            applyFieldFrame({
                modelId: timeData.modelId,
                fieldId: fid,
                fieldName: field.field_name,
                valueMin: field.valueMin,
                valueMax: field.valueMax,
                values: heatArr,
            });
            saveActiveField(fid);
        } catch (e) {
            console.error("加载时序数据失败，使用默认0值填充：", e);
            applyFieldFrame({ fieldId: fid, valueMin: -1, valueMax: 1, values: null });
        }
        legendPanel?.update();
    }
    // ======================================================================

    async function initScene() {
        if (resourcesDisposed) return;
        // 1 优先加载外部着色器文件
        vertShaderText = await loadShaderFile(`${config.shaderDir}/bridgeHeat.vert`);
        fragShaderText = await loadShaderFile(`${config.shaderDir}/bridgeHeat.frag`);
        // 2 加载根目录色板json
        await loadColorMaps(config.colorMapUrl);
        if (resourcesDisposed) return;
        colorMapsCache = getAllColorMaps();
        legendPanel = new LegendPanel();
        legendPanel.loadSettings();
        loadSavedColorMap();

        console.log("开始加载模型");

        const model = await loadGLTF(config.modelUrl);
        if (resourcesDisposed) {
            // 初始化期间被卸载：释放刚加载但未挂载的模型
            disposeObject3D(model);
            return;
        }
        // 原始桥面放入root_model，自身无任何变换
        root_model.add(model);

        // 包围盒只算一次：首帧适配和 resize 复用同一份结果
        cachedBridgeBoxInfo = calcModelRawBox(root_model);
        cachedFitDistance = null;
        fitCameraByRawBox(cachedBridgeBoxInfo);

        // 传感器层：模板（可选）+ 6 个占位传感器
        await sensorLayer.loadTemplate();
        if (resourcesDisposed) return;
        sensorLayer.createDefault(cachedBridgeBoxInfo.box);

        console.log("模型加载完成，可以执行后续逻辑");

        // 加载第一帧热力数据并应用到模型（优先恢复上次选择的场）
        const savedFieldId = loadSavedFieldId();
        await loadTimeStep(config.timeStepJson, savedFieldId ?? config.fieldId);
        if (resourcesDisposed) return;

        // 色标条 + 色板选择框
        legendPanel.create();
        createViewResetButton();
    }




    function animate() {
        orbitControls.update();
        renderer.render(scene, camera);

    }
    // renderer.setAnimationLoop(animate);


    (async () => {
        await initScene();
        if (resourcesDisposed) return;
        renderer.setAnimationLoop(animate);
    })()






    return {
        dispose: disposeAllResources,
        resize: resizeHandler,
        setColorMap: switchColorMap,
        setLegendOptions: (opts) => (legendPanel ? legendPanel.setOptions(opts) : null),
        getLegendOptions: () => (legendPanel ? legendPanel.getOptions() : null),
        loadTimeStep,
        applyFieldFrame,
        setField: switchField,
        getFields: getFieldOptions,
        getFieldId: () => currentFieldId,
        resetView,
        get canvas() { return renderer.domElement; },
        get scene() { return scene; },
        get camera() { return camera; },
        get controls() { return orbitControls; },
    };
}



