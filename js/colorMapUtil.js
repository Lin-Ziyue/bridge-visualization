import * as THREE from 'three';

// ========== 完全私有变量，外部任何文件无法直接访问 ==========
let colorMapList = [];
let activeMapName = "viridis";
const colorTextureCache = new Map();

/**
 * 加载色板json（唯一初始化入口）
 * @param {string} file
 */
export async function loadColorMaps(file="/colorMap.json"){

    const res = await fetch(file);
    if (!res.ok) throw new Error(`色板${file}加载失败，HTTP${res.status}`);
    const rawData = await res.json();
    // 内部赋值私有数组
    colorMapList = rawData;
}

/**
 * 切换当前激活色板（唯一修改变量的入口）
 * @param {string} name 色板name字段
 */
export function setActiveMap(name) {
    activeMapName = name;
}

/**
 * 获取全部色板【返回数组副本，外部修改不会影响内部原始数据】
 * @returns Array 色板拷贝
 */
export function getAllColorMaps() {
    return JSON.parse(JSON.stringify(colorMapList));
}

/**
 * 根据名称查询单条色板【返回对象副本，只读】
 * @param {string} name
 * @returns Object|null
 */
export function findColorMapByName(name) {
    const target = colorMapList.find(item => item.name === name);
    if (!target) return null;
    return JSON.parse(JSON.stringify(target));
}

/**
 * 获取当前激活的色板名称（只读，无法直接赋值）
 * @returns string
 */
export function getActiveMapName() {
    return activeMapName;
}

/**
 * 把当前色板在 CPU 端采样成 256×1 的 DataTexture，供 shader 单次查询
 * @param {string} [name] 色板name字段，默认当前激活色板
 * @returns {THREE.DataTexture}
 */
export function buildColorTexture(name = activeMapName) {
    if (colorTextureCache.has(name)) return colorTextureCache.get(name);

    let map = colorMapList.find(m => m.name === name);
    // 兜底降级逻辑
    if (!map) {
        console.error(`未找到色板【${name}】，自动切换为viridis`);
        map = colorMapList.find(m => m.name === "viridis");
        if (!map) throw new Error("色板配置文件为空，请检查colorMap.json");
    }

    const stops = map.stops.slice().sort((a, b) => a.value - b.value);
    const SIZE = 256;
    const data = new Uint8Array(SIZE * 4);

    for (let i = 0; i < SIZE; i++) {
        const t = i / (SIZE - 1);
        let s0 = stops[0];
        let s1 = stops[stops.length - 1];
        // 两端超出时取端点色，中间段线性插值
        if (t <= stops[0].value) {
            s0 = s1 = stops[0];
        } else if (t >= stops[stops.length - 1].value) {
            s0 = s1 = stops[stops.length - 1];
        } else {
            for (let j = 0; j < stops.length - 1; j++) {
                if (t >= stops[j].value && t <= stops[j + 1].value) {
                    s0 = stops[j];
                    s1 = stops[j + 1];
                    break;
                }
            }
        }
        const span = s1.value - s0.value;
        const ratio = span > 1e-12 ? (t - s0.value) / span : 0;
        const p = i * 4;
        data[p] = Math.round(s0.r + (s1.r - s0.r) * ratio);
        data[p + 1] = Math.round(s0.g + (s1.g - s0.g) * ratio);
        data[p + 2] = Math.round(s0.b + (s1.b - s0.b) * ratio);
        data[p + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, SIZE, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    colorTextureCache.set(name, texture);
    return texture;
}

/**
 * 释放所有缓存的色板纹理（应用卸载时调用）
 */
export function disposeColorMapTextures() {
    colorTextureCache.forEach(texture => texture.dispose());
    colorTextureCache.clear();
}