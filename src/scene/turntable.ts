import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export type DeckView = 'overview' | 'disc' | 'monitor'
export type DeckPanels = {
  transport: HTMLElement | null
  editor: HTMLElement | null
}
export type DeckAction = 'play' | 'previous' | 'next' | 'reset'
export type DeckTransportState = { playing: boolean; canPrevious: boolean; canNext: boolean; pressed: DeckAction | null }
export type DeckAppearance = 'vinyl' | 'cd'
export type DeckHit = { kind: 'disc'; angle: number; radius: number }

/** The scene displays the live physical disc, independently of the observation camera. */
export function createTurntable(canvas: HTMLCanvasElement, source: HTMLCanvasElement, panels: DeckPanels) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  const textures = new Set<THREE.Texture>()
  const texture = (image: HTMLCanvasElement) => {
    const result = new THREE.CanvasTexture(image)
    result.colorSpace = THREE.SRGBColorSpace
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    textures.add(result)
    return result
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.035)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.65
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xfff7e8, 0x8297ab, 1.2))
  const light = new THREE.DirectionalLight(0xfff5e4, 2.4)
  light.position.set(-4, 8, 3)
  scene.add(light)
  const fill = new THREE.DirectionalLight(0xd4e8ff, 1.1)
  fill.position.set(5, 4, -4)
  scene.add(fill)

  const silver = new THREE.MeshStandardMaterial({ color: 0xc9ccc7, metalness: 0.65, roughness: 0.38 })
  const graphite = new THREE.MeshStandardMaterial({ color: 0x28323d, metalness: 0.3, roughness: 0.45 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab7be, metalness: 0.9, roughness: 0.24 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171e26, roughness: 0.75 })
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const result = new THREE.Mesh(geometry, material)
    result.position.set(x, y, z)
    scene.add(result)
    return result
  }
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, radius = 0.05) =>
    mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z)
  const cylinder = (radius: number, height: number, material: THREE.Material, x: number, y: number, z: number) =>
    mesh(new THREE.CylinderGeometry(radius, radius, height, 128), material, x, y, z)
  const plane = (w: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const result = mesh(new THREE.PlaneGeometry(w, d), material, x, y, z)
    result.rotation.x = -Math.PI / 2
    return result
  }
  const label = (text: string, w: number, d: number, x: number, z: number, color = '#344553', serif = false) => {
    const image = document.createElement('canvas')
    image.width = 768
    image.height = Math.round(768 * d / w)
    const ctx = image.getContext('2d')!
    ctx.fillStyle = color
    ctx.font = `${serif ? 'italic bold' : '600'} ${Math.round(image.height * 0.76)}px ${serif ? 'Georgia' : 'monospace'}`
    ctx.fillText(text, 0, image.height * 0.8)
    return plane(w, d, new THREE.MeshBasicMaterial({ map: texture(image), transparent: true, depthWrite: false, toneMapped: false }), x, 0.661, z)
  }
  const shadow = document.createElement('canvas')
  shadow.width = shadow.height = 256
  const shadowCtx = shadow.getContext('2d')!
  shadowCtx.filter = 'blur(11px)'
  shadowCtx.fillStyle = '#0009'
  shadowCtx.fillRect(20, 25, 216, 201)
  plane(6.8, 7.8, new THREE.MeshBasicMaterial({ map: texture(shadow), transparent: true, opacity: 0.65, depthWrite: false }), -1.4, 0, 0.25)
  for (const x of [-3.3, 0.5]) for (const z of [-1.85, 2.75]) cylinder(0.24, 0.2, rubber, x, 0.14, z)
  box(5.35, 0.34, 6.3, graphite, -1.4, 0.30, 0.5, 0.12)
  box(5.31, 0.32, 6.28, silver, -1.4, 0.49, 0.5, 0.11)
  for (const x of [-3.82, 1.02]) for (const z of [-2.33, 3.35]) {
    cylinder(0.055, 0.01, steel, x, 0.656, z)
    box(0.07, 0.006, 0.012, graphite, x, 0.664, z, 0.002).rotation.y = 0.5
  }
  const centerX = -1.40
  const centerZ = -0.06
  const discY = 0.79
  cylinder(2.25, 0.04, rubber, centerX, 0.667, centerZ)
  cylinder(2.19, 0.10, steel, centerX, 0.72, centerZ)
  cylinder(2.13, 0.03, rubber, centerX, 0.765, centerZ)
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.046, 0.024), graphite, 166)
  const transform = new THREE.Object3D()
  for (let i = 0; i < 166; i++) {
    const angle = i / 166 * Math.PI * 2
    transform.position.set(centerX + 2.19 * Math.sin(angle), 0.718, centerZ + 2.19 * Math.cos(angle))
    transform.rotation.y = angle
    transform.updateMatrix()
    teeth.setMatrixAt(i, transform.matrix)
  }
  scene.add(teeth)
  const discTexture = texture(source)
  const discMaterial = new THREE.MeshPhysicalMaterial({ map: discTexture, transparent: true, roughness: 0.39, metalness: 0.1, clearcoat: 0.2, clearcoatRoughness: 0.28 })
  const cdFinish = { value: 0 }
  discMaterial.onBeforeCompile = shader => {
    shader.uniforms.deckCD = cdFinish
    shader.vertexShader = 'varying vec2 deckUV; varying vec3 deckWorld;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>', '#include <worldpos_vertex>\ndeckUV=uv; deckWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
    )
    shader.fragmentShader = 'uniform float deckCD; varying vec2 deckUV; varying vec3 deckWorld;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>', `#include <map_fragment>
      float radius=length(deckUV-.5);
      float discMask=smoothstep(.18,.19,radius);
      float darkInk=1.-smoothstep(.09,.17,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
      diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.015,.035,.055),vec3(.56,.62,.65),darkInk),deckCD*discMask);`,
    ).replace('#include <opaque_fragment>', `
      vec2 direction=deckWorld.xz-vec2(-1.40,-.06);
      float angle=atan(direction.y,direction.x);
      float gleam=pow(abs(cos(angle+.72)),10.);
      float radial=length(direction)/2.08;
      float surfaceMask=smoothstep(.34,.36,radial);
      vec3 rainbow=.5+.5*cos(vec3(.1,2.2,4.3)+angle*8.+radial*1.6);
      outgoingLight+=surfaceMask*gleam*mix(vec3(.055),rainbow*.35,deckCD);
      #include <opaque_fragment>`)
  }
  const disc = mesh(new THREE.CircleGeometry(2.08, 180), discMaterial, centerX, discY, centerZ)
  disc.rotation.x = -Math.PI / 2
  cylinder(0.075, 0.10, steel, centerX, 0.84, centerZ)
  const cdHub = cylinder(0.23, 0.035, steel, centerX, 0.81, centerZ)
  cdHub.visible = false
  label('▼', 0.24, 0.2, centerX, -2.38, '#ba632f')

  // A recessed display is part of the chassis, driven by the current physical motor speed.
  box(1.23, 0.022, 0.47, graphite, -3.14, 0.653, 2.47, 0.035)
  const speedDisplay = document.createElement('canvas')
  speedDisplay.width = 512
  speedDisplay.height = 160
  const speedContext = speedDisplay.getContext('2d')!
  const speedTexture = texture(speedDisplay)
  plane(1.10, 0.344, new THREE.MeshBasicMaterial({ map: speedTexture, toneMapped: false }), -3.14, 0.668, 2.47)
  let displayedRpm = ''
  function updateSpeed(rpm: number) {
    const value = Math.abs(rpm)
    const text = value >= 1000 ? value.toFixed(0) : value.toFixed(2)
    if (text === displayedRpm) return
    displayedRpm = text
    speedContext.fillStyle = '#0c1b23'
    speedContext.fillRect(0, 0, 512, 160)
    speedContext.font = '500 18px ui-monospace, monospace'
    speedContext.fillStyle = '#7fa5a6'
    speedContext.fillText('MOTOR SPEED', 24, 31)
    speedContext.font = '500 82px ui-monospace, monospace'
    speedContext.fillStyle = '#d4eee3'
    speedContext.shadowColor = '#a6e3d15c'
    speedContext.shadowBlur = 9
    speedContext.fillText(text, 23, 126)
    speedContext.shadowBlur = 0
    speedContext.font = '500 30px ui-monospace, monospace'
    speedContext.fillStyle = '#9cc4bd'
    speedContext.fillText('RPM', 420, 123)
    speedTexture.needsUpdate = true
    canvas.setAttribute('aria-description', `机身转速显示 ${text} RPM`)
  }

  for (let i = 0; i < 12; i++) box(0.06, 0.12, 0.015, rubber, -2.25 + i * 0.15, 0.33, 3.65, 0.006)

  const keyColors = [0x486388, 0xb8c1c6, 0xb8c1c6, 0x515c65]
  const actions: DeckAction[] = ['play', 'previous', 'next', 'reset']
  const keys = actions.map((action, index) => {
    const x = -3.675 + (index + 0.5) * (4.75 / actions.length)
    box(1.10, 0.033, 0.55, rubber, x, 0.664, 3.24, 0.025)
    const material = new THREE.MeshStandardMaterial({ color: keyColors[index], metalness: 0.25, roughness: 0.36 })
    const cap = box(1.02, 0.12, 0.48, material, x, 0.735, 3.24, 0.04)
    return { action, cap, material }
  })
  const ledMaterial = new THREE.MeshStandardMaterial({ color: 0x1b3d38, emissive: 0xa5e0c9, emissiveIntensity: 0, roughness: 0.4 })
  cylinder(0.028, 0.008, ledMaterial, -3.08125, 0.658, 2.84)

  const framePositions = new THREE.Float32BufferAttribute(new Float32Array(12), 3)
  const frameGeometry = new THREE.BufferGeometry()
  frameGeometry.setAttribute('position', framePositions)
  const frame = new THREE.LineLoop(frameGeometry, new THREE.LineBasicMaterial({ color: 0xe99b50, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }))
  frame.renderOrder = 2
  frame.frustumCulled = false
  scene.add(frame)
  const ray = new THREE.Raycaster()
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -discY)
  const point = new THREE.Vector3()
  const pointer = new THREE.Vector2()
  const workspace = canvas.closest<HTMLElement>('.workbench')
  let view: DeckView = 'overview'
  let zoom = 1
  let animation = 0
  let transitionStart = 0
  let fromPose = { x: -0.8, y: 1, z: 0.25, half: 3.9, tilt: 0.9, yaw: 0.32 }
  let pose = { ...fromPose }
  let targetPose = { ...fromPose }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Preserve the homogeneous divide so tilted keycaps and their native targets share perspective.
  function projectPanel(element: HTMLElement | null, origin: THREE.Vector3, across: THREE.Vector3, down: THREE.Vector3, pixelsW: number, pixelsH: number) {
    if (!element) return
    const rect = canvas.getBoundingClientRect()
    const parent = element.offsetParent?.getBoundingClientRect()
    if (!parent || !rect.width || !rect.height) return
    const panelToWorld = new THREE.Matrix4().set(
      across.x / pixelsW, down.x / pixelsH, 0, origin.x,
      across.y / pixelsW, down.y / pixelsH, 0, origin.y,
      across.z / pixelsW, down.z / pixelsH, 1, origin.z,
      0, 0, 0, 1,
    )
    const clip = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(panelToWorld).elements
    const centerX = rect.width / 2 + rect.left - parent.left
    const centerY = rect.height / 2 + rect.top - parent.top
    const divisor = clip[15]
    const screenX = (index: number) => (rect.width / 2 * clip[index] + centerX * clip[index + 3]) / divisor
    const screenY = (index: number) => (-rect.height / 2 * clip[index + 1] + centerY * clip[index + 3]) / divisor
    const matrix = [
      screenX(0), screenY(0), 0, clip[3] / divisor,
      screenX(4), screenY(4), 0, clip[7] / divisor,
      0, 0, 1, 0,
      screenX(12), screenY(12), 0, 1,
    ]
    element.style.transform = `matrix3d(${matrix.join(',')})`
  }
  function renderScene() {
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    const distance = pose.half / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const direction = new THREE.Vector3(Math.sin(pose.yaw) * pose.tilt, 1, Math.cos(pose.yaw) * pose.tilt).normalize()
    camera.position.set(pose.x, pose.y, pose.z).addScaledVector(direction, distance)
    camera.lookAt(pose.x, pose.y, pose.z)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    renderer.render(scene, camera)
    projectPanel(panels.transport, new THREE.Vector3(-3.675, 0.799, 2.94), new THREE.Vector3(4.75, 0, 0), new THREE.Vector3(0, 0, 0.60), 1000, 126)
    projectPanel(panels.editor, new THREE.Vector3(centerX - 2.08, 0.802, centerZ - 2.08), new THREE.Vector3(4.16, 0, 0), new THREE.Vector3(0, 0, 4.16), 1024, 1024)
  }
  function desiredPose() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
    if (view === 'disc') return { x: centerX, y: 0.67, z: 0.55, half: Math.max(3.8, 3.2 / aspect) / zoom, tilt: 0, yaw: 0 }
    if (view === 'monitor') return { x: -3.3, y: 1.8, z: 0.3, half: Math.max(4.45, 6.5 / aspect), tilt: 0.95, yaw: -0.12 }
    return { x: -1.4, y: 1.2, z: 0.4, half: Math.max(4.4, 5.4 / aspect), tilt: 0.9, yaw: 0.32 }
  }
  function animate(now: number) {
    animation = 0
    const fraction = Math.min(1, (now - transitionStart) / 460)
    const easing = 1 - Math.pow(1 - fraction, 3)
    pose = {
      x: THREE.MathUtils.lerp(fromPose.x, targetPose.x, easing),
      y: THREE.MathUtils.lerp(fromPose.y, targetPose.y, easing),
      z: THREE.MathUtils.lerp(fromPose.z, targetPose.z, easing),
      half: THREE.MathUtils.lerp(fromPose.half, targetPose.half, easing),
      tilt: THREE.MathUtils.lerp(fromPose.tilt, targetPose.tilt, easing),
      yaw: THREE.MathUtils.lerp(fromPose.yaw, targetPose.yaw, easing),
    }
    renderScene()
    if (fraction < 1) animation = requestAnimationFrame(animate)
    else workspace?.removeAttribute('data-camera-moving')
  }
  function changeView(next: DeckView, nextZoom = 1, instant = false) {
    view = next
    zoom = nextZoom
    fromPose = { ...pose }
    targetPose = desiredPose()
    cancelAnimationFrame(animation)
    if (instant || reducedMotion) {
      workspace?.removeAttribute('data-camera-moving')
      pose = { ...targetPose }
      renderScene()
    } else {
      workspace?.setAttribute('data-camera-moving', 'true')
      transitionStart = performance.now()
      animation = requestAnimationFrame(animate)
    }
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6))
    renderer.setSize(width, height, false)
    changeView(view, zoom, true)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  return {
    setView: changeView,
    setTransportState(state: DeckTransportState) {
      ledMaterial.emissiveIntensity = state.playing ? 1.2 : 0
      keys.forEach(({ action, cap, material }, index) => {
        const pressed = state.pressed === action
        const latched = action === 'play' && state.playing
        cap.position.y = 0.735 - (pressed ? 0.035 : latched ? 0.018 : 0)
        material.color.setHex(keyColors[index])
        const disabled = action === 'previous' && !state.canPrevious || action === 'next' && !state.canNext
        if (disabled) material.color.multiplyScalar(0.72)
      })
      renderScene()
    },
    update(appearance: DeckAppearance, rpm: number, crop: { x: number; y: number; width: number; height: number }, decorate: boolean) {
      discTexture.needsUpdate = true
      discMaterial.metalness = appearance === 'cd' ? 0.4 : 0.1
      discMaterial.iridescence = appearance === 'cd' ? 0.35 : 0
      cdHub.visible = appearance === 'cd'
      cdFinish.value = appearance === 'cd' && decorate ? 1 : 0
      updateSpeed(rpm)
      const x = centerX + (crop.x - 0.5) * 4.16
      const z = centerZ + (crop.y - 0.5) * 4.16
      const w = crop.width * 4.16, h = crop.height * 4.16
      framePositions.array.set([x, discY + 0.01, z, x + w, discY + 0.01, z, x + w, discY + 0.01, z + h, x, discY + 0.01, z + h])
      framePositions.needsUpdate = true
      renderScene()
    },
    hit(clientX: number, clientY: number): DeckHit | null {
      const bounds = canvas.getBoundingClientRect()
      pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, 1 - (clientY - bounds.top) / bounds.height * 2)
      ray.setFromCamera(pointer, camera)
      if (!ray.ray.intersectPlane(floor, point)) return null
      const dx = point.x - centerX, dz = point.z - centerZ
      if (Math.hypot(dx, dz) < 2.08 && Math.hypot(dx, dz) > 0.16) return { kind: 'disc', angle: Math.atan2(dz, dx), radius: Math.hypot(dx, dz) / 2.08 * 100 }
      return null
    },
    dispose() {
      observer.disconnect()
      cancelAnimationFrame(animation)
      const materials = new Set<THREE.Material>()
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose()
          const list = Array.isArray(object.material) ? object.material : [object.material]
          list.forEach(material => materials.add(material))
        }
      })
      materials.forEach(material => material.dispose())
      textures.forEach(item => item.dispose())
      environment.dispose()
      renderer.dispose()
    },
  }
}
