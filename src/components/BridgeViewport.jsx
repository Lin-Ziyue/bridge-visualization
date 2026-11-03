import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = '/model.glb'
const HEAT_META_URL = '/bridge_output/30205080.1784464473837.json'
const HEAT_BIN_URL = '/bridge_output/30205080.1784464473837.0.bin'

const COLOR_LOW = new THREE.Color('#1747ff')
const COLOR_MID = new THREE.Color('#20d6ff')
const COLOR_HIGH = new THREE.Color('#ffb547')

function colorFor(t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  return clamped < 0.5
    ? new THREE.Color().lerpColors(COLOR_LOW, COLOR_MID, clamped * 2)
    : new THREE.Color().lerpColors(COLOR_MID, COLOR_HIGH, (clamped - 0.5) * 2)
}

async function loadHeat() {
  try {
    const [metaResponse, binResponse] = await Promise.all([
      fetch(HEAT_META_URL),
      fetch(HEAT_BIN_URL),
    ])
    if (!metaResponse.ok || !binResponse.ok) return null
    const meta = await metaResponse.json()
    const field = meta?.field_map?.['0']
    const values = new Float32Array(await binResponse.arrayBuffer())
    if (!field || !values.length) return null
    return { values, min: field.valueMin, max: field.valueMax }
  } catch {
    return null
  }
}

function loadModel() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_URL, (gltf) => resolve(gltf.scene), undefined, reject)
  })
}

export default function BridgeViewport() {
  const hostRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [autoRotate, setAutoRotate] = useState(true)

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate
  }, [autoRotate])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let raf = 0
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050b14, 0.045)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)
    camera.position.set(2.4, 1.55, 2.6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 1.1
    controls.maxDistance = 8
    controls.minPolarAngle = 0.15
    controls.maxPolarAngle = Math.PI / 2.04
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.65
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    const ambient = new THREE.AmbientLight(0x9cc8ff, 1.4)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 6, 5)
    const fill = new THREE.PointLight(0x2f7bff, 8, 9)
    fill.position.set(-3, 1.5, -2)
    const warm = new THREE.PointLight(0xffb547, 4, 8)
    warm.position.set(3, -1, 2)
    scene.add(ambient, key, fill, warm)

    const grid = new THREE.GridHelper(7, 28, 0x1c4f78, 0x0d2236)
    grid.position.y = -0.5
    grid.material.transparent = true
    grid.material.opacity = 0.32
    scene.add(grid)

    const resize = () => {
      const width = host.clientWidth || 1
      const height = host.clientHeight || 1
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const animate = () => {
      if (disposed) return
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const applyHeat = (model, heat) => {
      const rawBox = new THREE.Box3().setFromObject(model)
      const rawSize = rawBox.getSize(new THREE.Vector3())
      const center = rawBox.getCenter(new THREE.Vector3())
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1

      model.position.sub(center)
      model.scale.setScalar(2.8 / maxDim)
      model.rotation.y = -0.16

      let offset = 0
      model.traverse((object) => {
        if (!object.isMesh) return
        const geometry = object.geometry
        const position = geometry.getAttribute('position')
        const count = position.count
        const colors = new Float32Array(count * 3)
        const localBox = new THREE.Box3().setFromBufferAttribute(position)
        const spanX = Math.max(localBox.max.x - localBox.min.x, 1e-6)
        const hasHeat = heat && heat.values.length >= offset + count
        const span = heat ? Math.max(heat.max - heat.min, 1e-9) : 1

        for (let i = 0; i < count; i++) {
          const t = hasHeat
            ? (heat.values[offset + i] - heat.min) / span
            : (position.getX(i) - localBox.min.x) / spanX
          const color = colorFor(t)
          colors[i * 3] = color.r
          colors[i * 3 + 1] = color.g
          colors[i * 3 + 2] = color.b
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        object.material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          metalness: 0.35,
          roughness: 0.38,
          emissive: 0x061a33,
          emissiveIntensity: 0.35,
          side: THREE.DoubleSide,
        })
        offset += count
      })
    }

    const boot = async () => {
      try {
        const [model, heat] = await Promise.all([loadModel(), loadHeat()])
        if (disposed) {
          model.traverse((object) => {
            if (object.isMesh) {
              object.geometry.dispose()
              object.material.dispose()
            }
          })
          return
        }
        applyHeat(model, heat)
        scene.add(model)
        setStatus('ready')
      } catch {
        if (!disposed) setStatus('error')
      }
    }
    boot()

    const stopAutoRotate = () => {
      controls.autoRotate = false
      setAutoRotate(false)
    }
    controls.addEventListener('start', stopAutoRotate)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.removeEventListener('start', stopAutoRotate)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      scene.traverse((object) => {
        if (object.isMesh || object.isLine) {
          object.geometry?.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material?.dispose())
        }
      })
      controlsRef.current = null
      cameraRef.current = null
    }
  }, [])

  const reset = () => {
    const controls = controlsRef.current
    const camera = cameraRef.current
    if (!controls || !camera) return
    camera.position.set(2.4, 1.55, 2.6)
    controls.target.set(0, 0, 0)
    controls.autoRotate = false
    setAutoRotate(false)
    controls.update()
  }

  return (
    <div className="viewport-canvas" ref={hostRef}>
      {status !== 'ready' && (
        <div className={`viewport-loading ${status === 'error' ? 'is-error' : ''}`}>
          {status === 'error' ? '模型加载失败，请检查 /model.glb' : '正在加载桥梁模型…'}
        </div>
      )}
      <div className="viewport-actions">
        <button type="button" onClick={reset}>复位视角</button>
        <button
          type="button"
          className={autoRotate ? 'is-active' : ''}
          onClick={() => setAutoRotate((value) => !value)}
        >
          自动旋转
        </button>
      </div>
    </div>
  )
}
