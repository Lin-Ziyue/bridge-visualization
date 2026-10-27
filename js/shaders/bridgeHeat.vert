precision highp float; // 浮点精度，科学可视化开高精度

// Three.js自动内置的4个矩阵，不用自己传
//uniform mat4 modelMatrix;      //物体自身所有层级变换（root_model + transform_wrapper）
//uniform mat4 viewMatrix;       //相机视角变换
//uniform mat4 projectionMatrix; //透视投影，把3D转2D屏幕

// 自定义顶点属性：后端bin里的热力值，一个顶点对应一个数字
attribute float aHeatValue;

// 传给片元着色器的变量，每个顶点带一个热力值
varying float vHeatVal;

void main() {
    // 把当前顶点的热力值传给片元
    vHeatVal = aHeatValue;
    // 核心：自动叠加所有层级变换，输出屏幕坐标
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}