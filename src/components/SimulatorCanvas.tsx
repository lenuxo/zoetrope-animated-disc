import { ObservationWindow } from './ObservationWindow'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import type { createTurntable, DeckAppearance, DeckView, DeckPanels, DeckTransportState } from '../scene/turntable'
import { useDrag } from '@use-gesture/react'
import { angularDelta, FixedRateSchedule } from '../simulation/model'
import type { RotationModel, Transport } from '../simulation/model'
import { PlateTextureCache, renderExposure } from '../simulation/render'
import type { PlateGeometry, PlateMaterial } from '../simulation/plate'
import type { RingLayer } from '../simulation/rings'

export type ViewMode = 'continuous' | 'camera'
export type FrameInfo = { time: number; sample: number; sampleTime: number; angle: number; exposureSamples: number }

type Props = {
  controlState: DeckTransportState
  active: boolean
  view: DeckView
  onViewChange: (view: DeckView) => void
  controlsHost: HTMLElement | null
  transportHost: HTMLElement | null
  mode: ViewMode
  playing: boolean
  fps: number
  exposure: number
  blur: boolean
  guides: boolean
  zoom: number
  revision: number
  transport: Transport
  motion: RotationModel
  onFrame: (info: FrameInfo) => void
  onRotate: (radians: number) => void
  material: PlateMaterial
  geometry: PlateGeometry
  rings?: RingLayer[]
  observationName?: string
  radius: number
  onRadiusChange: (radius: number) => void
  observationHost?: HTMLElement | null
  onPlay: () => void
  onInspectDisc: (radius: number) => void
}

export function SimulatorCanvas({ controlState, active, view, onViewChange, controlsHost, transportHost, mode, playing, fps, exposure, blur, guides, zoom, revision, transport, motion, onFrame, onRotate, material, geometry, rings, observationName, radius, onRadiusChange, observationHost, onPlay, onInspectDisc }: Props) {
  const [appearance, setAppearance] = useState<DeckAppearance>('vinyl')
  const [sceneError, setSceneError] = useState(false)
  const editing = sceneError || view === 'disc'
  const panels = useRef<DeckPanels>({ transport: null, editor: null })
  const latestControlState = useRef(controlState)
  const cameraSettings = useRef({ view, zoom })
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null)
  const latestSceneFrame = useRef<{
    appearance: DeckAppearance
    rpm: number
    crop: { x: number; y: number; width: number; height: number }
    decorate: boolean
  } | null>(null)
  const sceneRef = useRef<ReturnType<typeof createTurntable> | null>(null)
  const sceneDown = useRef<{ x: number; y: number; radius: number } | null>(null)
  const sceneDrag = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const previousAngle = useRef<number | null>(null)
  const [scratching, setScratching] = useState(false)
  const [observationSize, setObservationSize] = useState({ width: 0.24, height: 0.12 })
  const centerY = 0.5 - (292 / 600) * radius / 100
  const observation = useMemo(() => {
    const height = Math.min(observationSize.height, 2 * Math.min(centerY, 1 - centerY))
    return { x: 0.5 - observationSize.width / 2, y: centerY - height / 2, width: observationSize.width, height }
  }, [observationSize, centerY])
  const lensRef = useRef<HTMLCanvasElement>(null)
  const cameraFrameRef = useRef<HTMLCanvasElement | null>(null)
  const [textures] = useState(() => new PlateTextureCache())

  const bind = useDrag(({ first, last, active, canceled, cancel, initial, xy: [x, y] }) => {
    if (canceled) { previousAngle.current = null; setScratching(false); return }
    const bounds = surfaceRef.current!.getBoundingClientRect()
    const dx = x - (bounds.left + bounds.width / 2)
    const dy = y - (bounds.top + bounds.height / 2)
    const radius = Math.hypot(dx, dy)
    if (first) {
      const initialX = initial[0] - (bounds.left + bounds.width / 2)
      const initialY = initial[1] - (bounds.top + bounds.height / 2)
      const initialRadius = Math.hypot(initialX, initialY)
      if (initialRadius > bounds.width * 0.49) { cancel(); return }
      previousAngle.current = initialRadius < bounds.width * 0.06 ? null : Math.atan2(initialY, initialX)
      surfaceRef.current!.focus({ preventScroll: true })
    }
    // Angle is unstable at the spindle. Re-anchor after crossing its dead zone.
    if (radius < bounds.width * 0.06) {
      previousAngle.current = null
    } else {
      const angle = Math.atan2(dy, dx)
      if (previousAngle.current !== null) onRotate(angularDelta(previousAngle.current, angle))
      previousAngle.current = angle
    }
    setScratching(active)
    if (last) previousAngle.current = null
  }, { enabled: !playing, preventDefault: true, pointer: { capture: true, keys: false } })

  useEffect(() => {
    const lifetime: { disposed: boolean; deck?: ReturnType<typeof createTurntable> } = { disposed: false }
    void import('../scene/turntable').then(({ createTurntable }) => {
      if (lifetime.disposed) return
      const deck = createTurntable(sceneCanvasRef.current!, canvasRef.current!, panels.current)
      lifetime.deck = deck
      sceneRef.current = deck
      sceneCanvasRef.current?.closest('.workbench')?.setAttribute('data-scene-ready', 'true')
      deck.setView(cameraSettings.current.view, cameraSettings.current.zoom, true)
      deck.setTransportState(latestControlState.current)
      const frame = latestSceneFrame.current
      if (frame) deck.update(frame.appearance, frame.rpm, frame.crop, frame.decorate)
    }).catch(() => {
      if (lifetime.disposed) return
      setSceneError(true)
      sceneCanvasRef.current?.closest('.workbench')?.setAttribute('data-scene-error', 'true')
    })
    const sceneCanvas = sceneCanvasRef.current!
    const lost = (event: Event) => {
      event.preventDefault()
      setSceneError(true)
      sceneCanvasRef.current?.closest('.workbench')?.setAttribute('data-scene-error', 'true')
    }
    sceneCanvas.addEventListener('webglcontextlost', lost)
    return () => {
      lifetime.disposed = true
      sceneCanvas.removeEventListener('webglcontextlost', lost)
      sceneRef.current = null
      lifetime.deck?.dispose()
    }
  }, [])

  useEffect(() => {
    Object.assign(panels.current, { transport: transportHost, editor: surfaceRef.current })
    sceneRef.current?.setView(cameraSettings.current.view, cameraSettings.current.zoom, true)
  }, [transportHost])

  useEffect(() => {
    latestControlState.current = controlState
    sceneRef.current?.setTransportState(controlState)
  }, [controlState])

  useEffect(() => {
    cameraSettings.current = { view, zoom }
    sceneRef.current?.setView(view, zoom)
  }, [view, zoom])

  useEffect(() => {
    if (!active) return
    const plate = textures.get(material, geometry, rings, guides)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const lens = lensRef.current!.getContext('2d')!
    // Keep camera integration off the physical disc's live texture.
    const cameraFrame = cameraFrameRef.current ??= document.createElement('canvas')
    if (cameraFrame.width !== canvas.width) cameraFrame.width = canvas.width
    if (cameraFrame.height !== canvas.height) cameraFrame.height = canvas.height
    const cameraContext = cameraFrame.getContext('2d')!
    const schedule = new FixedRateSchedule(fps)
    transport.setPlaying(playing, performance.now())
    let request = 0
    let lastSceneTime = -1
    let lastCaptureTime = -1
    let lastReport = -Infinity
    let sampleCount = 1

    const draw = (now: number) => {
      const time = transport.timeAt(now)
      const sample = schedule.indexAt(time)
      const sampleTime = schedule.timeAtIndex(sample)
      const captureTime = mode === 'camera' ? sampleTime : time
      if (time !== lastSceneTime) {
        // The model follows physical time at the display refresh rate, without a camera shutter.
        renderExposure(ctx, plate, motion, time, 0)
        latestSceneFrame.current = { appearance, rpm: Math.abs(motion.rpmAt(time)), crop: observation, decorate: material.kind === 'example' && !rings }
        sceneRef.current?.update(appearance, Math.abs(motion.rpmAt(time)), observation, material.kind === 'example' && !rings)
        lastSceneTime = time
      }
      if (captureTime !== lastCaptureTime) {
        const shutter = mode === 'continuous' && !blur ? 0 : exposure
        sampleCount = renderExposure(cameraContext, plate, motion, captureTime, shutter)
        lens.clearRect(0, 0, lens.canvas.width, lens.canvas.height)
        lens.imageSmoothingQuality = 'high'
        lens.drawImage(cameraFrame, cameraFrame.width * observation.x, cameraFrame.height * observation.y,
          cameraFrame.width * observation.width, cameraFrame.height * observation.height,
          0, 0, lens.canvas.width, lens.canvas.height)
        lastCaptureTime = captureTime
      }
      if (now - lastReport >= 200 || !playing) {
        onFrame({ time, sample, sampleTime, angle: motion.angleAt(captureTime), exposureSamples: sampleCount })
        lastReport = now
      }
      if (playing) request = requestAnimationFrame(draw)
    }
    draw(performance.now())
    return () => cancelAnimationFrame(request)
  }, [active, textures, mode, playing, fps, exposure, blur, guides, revision, transport, motion, onFrame, observation, material, geometry, rings, appearance, editing, observationHost])

  const observationPanel = (
      <section aria-labelledby="observation-title" className="preview-panel observation-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div>
            <h2 id="observation-title" className="text-base font-semibold">观察监视器</h2>
            <p className="mt-1 text-xs text-muted-foreground">{observationName ? `${observationName} · 半径 ${radius}%` : `半径 ${radius}% · 相机独立采样`}</p>
          </div>
          <span className="observation-mode">{mode === 'camera' ? '相机采样' : '连续旋转'}</span>
        </div>
        <div className="observation-stage">
          <canvas ref={lensRef} width={Math.round(960 * Math.min(1, observation.width / observation.height))} height={Math.round(960 * Math.min(1, observation.height / observation.width))} data-testid="observation-canvas" className="observation-image" style={{ width: `min(100cqw, ${100 * observation.width / observation.height}cqh)`, height: `min(100cqh, ${100 * observation.height / observation.width}cqw)` }} role="img" aria-label="唱片顶部固定位置的放大观察窗" />
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-muted-foreground sm:px-6">
          <p>逐格同步时，动作在原位接替。轻微失配时，可看到图案沿圆周漂移。</p>
          <p className="mt-1 text-xs">{mode === 'camera' ? '按相机采样时刻更新，曝光拖影仅作用于此视窗。' : '连续旋转预览，也受屏幕刷新率影响。'}</p>
        </div>
      </section>
  )

  const appearanceControls = <div className="deck-view-controls">
    <span>盘片外观</span>
    <div role="group" aria-label="介质外观">{(['vinyl', 'cd'] as const).map(value => <Button key={value} variant={appearance === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={appearance === value} onClick={() => setAppearance(value)}>{value === 'vinyl' ? '黑胶' : 'CD'}</Button>)}</div>
    <Button variant="ghost" size="sm" onClick={() => onViewChange('overview')} disabled={sceneError}>返回全景</Button>
  </div>

  return (
    <div className="canvas-workspace">
      {observationHost ? createPortal(observationPanel, observationHost) : observationPanel}
      {controlsHost && createPortal(appearanceControls, controlsHost)}
      <section className="preview-panel record-panel" aria-label="三维实验仪">
        <div className="record-stage is-scene">
          <canvas ref={sceneCanvasRef} className="turntable-canvas" data-testid="turntable" aria-label="三维唱片实验仪，暂停时拖动唱片搓碟，方向键微调，空格播放" role="img" tabIndex={0}
            onKeyDown={event => {
              if (event.code === 'Space') { event.preventDefault(); onPlay() }
              if (!playing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                event.preventDefault()
                onRotate((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 180 * (event.shiftKey ? 10 : 1))
              }
            }}
            onPointerDown={event => {
              if (event.button !== 0) return
              const hit = sceneRef.current?.hit(event.clientX, event.clientY)
              if (hit?.kind === 'disc' && !playing) {
                sceneDrag.current = hit.angle
                sceneDown.current = { x: event.clientX, y: event.clientY, radius: hit.radius }
                event.currentTarget.setPointerCapture(event.pointerId)
              }
            }}
            onPointerMove={event => {
              const hit = sceneRef.current?.hit(event.clientX, event.clientY)
              event.currentTarget.style.cursor = hit?.kind === 'disc' ? (sceneDrag.current === null ? 'grab' : 'grabbing') : hit ? 'pointer' : 'default'
              if (sceneDrag.current === null) return
              if (hit?.kind !== 'disc') { sceneDrag.current = null; return }
              onRotate(angularDelta(sceneDrag.current, hit.angle))
              sceneDrag.current = hit.angle
            }}
            onPointerUp={event => {
              const down = sceneDown.current
              if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 4) onInspectDisc(down.radius)
              sceneDown.current = null
            }}
            onLostPointerCapture={() => { sceneDrag.current = null }}
            onPointerCancel={() => { sceneDrag.current = null }}
          />

          <div {...bind()} hidden={!editing} ref={surfaceRef} role="group" aria-label="唱片搓碟区域，暂停时拖动旋转，左右方向键微调，Shift 加速" tabIndex={0} data-testid="record-surface" className="scratch-surface record-disc relative aspect-square select-none" style={{ touchAction: playing ? 'auto' : 'none', cursor: playing ? 'default' : scratching ? 'grabbing' : 'grab' }} onKeyDown={(event) => {
            if (event.code === 'Space') { event.preventDefault(); onPlay() }
            if (!playing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
              event.preventDefault()
              onRotate((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1) * Math.PI / 180)
            }
          }}>
            <canvas ref={canvasRef} width="1024" height="1024" className="block size-full" role="img" aria-label="按实际运动时刻连续旋转的唱片预览" data-testid="record" />
            <ObservationWindow onRadiusChange={onRadiusChange} radius={radius} centerY={centerY} size={{ width: observation.width, height: observation.height }} onChange={setObservationSize} />
          </div>
        </div>
        <p className="scene-instructions">{sceneError ? '3D 场景暂不可用，已切换到俯视编辑。' : editing ? '拖动观察框取景 · 拖动盘面搓碟 · ← → 微调' : '拨动唱片 · 选择悬浮工具 · 在下方切换视角'}</p>
      </section>
    </div>
  )
}
