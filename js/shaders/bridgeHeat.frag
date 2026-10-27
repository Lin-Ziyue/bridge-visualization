precision highp float;

// 从顶点传过来的当前像素对应的热力值
varying float vHeatVal;

// 全场最小、最大值，从时序json读取
uniform float uValMin;
uniform float uValMax;

// CPU 端按色板采样生成的 256×1 渐变纹理
uniform sampler2D uColorMap;

void main() {
    // 1. 把真实热力值压缩到0~1区间；分母兜底避免除零
    float t = clamp((vHeatVal - uValMin) / max(uValMax - uValMin, 1e-20), 0.0, 1.0);
    // 2. 直接查色板纹理，v 取 0.5 取纹理中心行
    vec3 outColor = texture2D(uColorMap, vec2(t, 0.5)).rgb;
    // 输出最终像素颜色，不透明
    gl_FragColor = vec4(outColor, 1.0);
}