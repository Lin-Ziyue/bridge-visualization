import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { sensors } from '../data/mock'
import { colorAt, palettes } from '../data/palettes'

const MODEL_URL = '/model.glb'
const HEAT_META_URL = '/bridge_output/30205080.1784464473837.json'
const HEAT_BIN_URL = '/bridge_output/30205080.1784464473837.0.bin'
const CAMERA_HOME = new THREE.Vector3(0, 0.05, 3)

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

function makeLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 40
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '600 22px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 64, 20)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    opacity: 0.9,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.3, 0.094, 1)
  sprite.renderOrder = 10
  return sprite
}

export default function BridgeViewport({ paletteName = 'viridis', selectedSensor = 'S-00', onSelectSensor }) {
  const hostRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const recolorRef = useRef(null)
  const sensorRefs = useRef(new Map())
  const selectedRef = useRef(selectedSensor)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    selectedRef.current = selectedSensor
    sensorRefs.current.forEach((item, id) => {
      const active = id === selectedSensor
      item.core.material.color.set(active ? 0xffffff : item.baseColor)
      item.ring.material.color.set(active ? 0xffffff : item.baseColor)
      item.ring.material.opacity = active ? 0.95 : 0.5
      item.label.visible = active
      item.label.material.opacity = active ? 1 : 0.72
    })
  }, [selectedSensor])

  useEffect(() => {
    recolorRef.current?.(paletteName)
  }, [paletteName])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let raf = 0
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050b14, 0.04)

    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100)
    camera.position.copy(CAMERA_HOME)
    camera.lookAt(0, 0, 0)
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

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.rotateSpeed = 2.0
    controls.zoomSpeed = 1.2
    controls.panSpeed = 0.8
    controls.noPan = true
    controls.staticMoving = false
    controls.dynamicDampingFactor = 0.15
    controlsRef.current = controls

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let sensorGroup = null

    const handleCanvasClick = (event) => {
      if (!sensorGroup || !onSelectSensor) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster
        .intersectObjects(sensorGroup.children, true)
        .find((item) => item.object.userData.sensorId)
      if (hit) onSelectSensor(hit.object.userData.sensorId)
    }
    renderer.domElement.addEventListener('click', handleCanvasClick)

    const ambient = new THREE.AmbientLight(0x9cc8ff, 1.5)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 6, 5)
    const fill = new THREE.PointLight(0x2f7bff, 8, 9)
    fill.position.set(-3, 1.5, -2)
    const warm = new THREE.PointLight(0xffb547, 4, 8)
    warm.position.set(3, -1, 2)
    scene.add(ambient, key, fill, warm)

    const grid = new THREE.GridHelper(7, 28, 0x1c4f78, 0x0d2236)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.55
    grid.position.y = 0
    grid.material.transparent = true
    grid.material.opacity = 0.3
    scene.add(grid)

    const resize = () => {
      const width = host.clientWidth || 1
      const height = host.clientHeight || 1
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      controls.handleResize()
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

    const meshInfo = []
    const recolorMesh = (info, name) => {
      const palette = palettes[name] || palettes.ocean
      const colors = info.colors
      for (let i = 0; i < info.count; i++) {
        const t = info.hasHeat
          ? (info.values[info.offset + i] - info.min) / info.span
          : (info.position.getX(i) - info.localMinX) / info.spanX
        const rgb = colorAt(palette.stops, t)
        colors[i * 3] = rgb.r
        colors[i * 3 + 1] = rgb.g
        colors[i * 3 + 2] = rgb.b
      }
      info.geometry.getAttribute('color').needsUpdate = true
    }

    const recolorAll = (name) => {
      meshInfo.forEach((info) => recolorMesh(info, name))
    }
    recolorRef.current = recolorAll

    const highlightSensors = (id) => {
      sensorRefs.current.forEach((item, sensorId) => {
        const active = sensorId === id
        item.core.material.color.set(active ? 0xffffff : item.baseColor)
        item.ring.material.color.set(active ? 0xffffff : item.baseColor)
        item.ring.material.opacity = active ? 0.95 : 0.5
        item.label.visible = active
        item.label.material.opacity = active ? 1 : 0.72
      })
    }

    const addSensors = (center, scale) => {
      const group = new THREE.Group()
      group.name = 'sensor-layer'
      sensorGroup = group
      scene.add(group)

      sensors.forEach((sensor) => {
        const baseColor = sensor.status === 'warning' ? 0xffb547 : 0x38d6ff
        const color = baseColor
        const position = new THREE.Vector3(
          (sensor.coord.x - center.x) * scale,
          (sensor.coord.y - center.y) * scale,
          0.055
        )

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 16),
          new THREE.MeshBasicMaterial({ color })
        )
        core.position.copy(position)
        core.userData.sensorId = sensor.id

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.058, 0.074, 28),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          })
        )
        ring.rotation.x = 0
        ring.position.copy(position)
        ring.position.z -= 0.008
        ring.userData.sensorId = sensor.id

        const stem = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(position.x, position.y, 0.008),
            new THREE.Vector3(position.x, position.y, position.z - 0.018),
          ]),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
        )

        const label = makeLabel(sensor.id, sensor.status === 'warning' ? '#ffb547' : '#38d6ff')
        label.position.set(position.x, position.y + 0.055, position.z + 0.02)
        label.userData.sensorId = sensor.id

        group.add(core, ring, stem, label)
        sensorRefs.current.set(sensor.id, { core, ring, label, baseColor })
      })

      highlightSensors(selectedRef.current)
    }

    const applyHeat = (model, heat) => {
      const rawBox = new THREE.Box3().setFromObject(model)
      const rawSize = rawBox.getSize(new THREE.Vector3())
      const center = rawBox.getCenter(new THREE.Vector3())
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
      const scale = 2.8 / maxDim

      model.position.sub(center)
      model.scale.setScalar(scale)

      model.traverse((object) => {
        if (!object.isMesh) return
        const geometry = object.geometry
        const position = geometry.getAttribute('position')
        const count = position.count
        const colors = new Float32Array(count * 3)
        const localBox = new THREE.Box3().setFromBufferAttribute(position)
        const info = {
          geometry,
          position,
          count,
          colors,
          offset: meshInfo.reduce((sum, item) => sum + item.count, 0),
          hasHeat: Boolean(heat && heat.values.length >= meshInfo.reduce((sum, item) => sum + item.count, 0) + count),
          values: heat?.values,
          min: heat?.min ?? 0,
          span: heat ? Math.max(heat.max - heat.min, 1e-9) : 1,
          localMinX: localBox.min.x,
          spanX: Math.max(localBox.max.x - localBox.min.x, 1e-6),
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
        meshInfo.push(info)
      })

      recolorAll(paletteName)
      scene.add(model)
      addSensors(center, scale)
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
        setStatus('ready')
      } catch {
        if (!disposed) setStatus('error')
      }
    }
    boot()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      renderer.domElement.removeEventListener('click', handleCanvasClick)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      scene.traverse((object) => {
        if (object.isMesh || object.isLine || object.isSprite) {
          object.geometry?.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            material?.map?.dispose()
            material?.dispose()
          })
        }
      })
      sensorRefs.current.clear()
      recolorRef.current = null
      controlsRef.current = null
      cameraRef.current = null
    }
  }, [])

  const reset = () => {
    const controls = controlsRef.current
    const camera = cameraRef.current
    if (!controls || !camera) return
    camera.position.copy(CAMERA_HOME)
    controls.target.set(0, 0, 0)
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
      </div>
    </div>
  )
}
