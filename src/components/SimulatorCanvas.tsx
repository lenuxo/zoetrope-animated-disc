import { ObservationWindow } from './ObservationWindow'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDrag } from '@use-gesture/react'
import { angularDelta, FixedRateSchedule } from '../simulation/model'
import type { RotationModel, Transport } from '../simulation/model'
import { PlateTextureCache, renderExposure } from '../simulation/render'
import type { PlateGeometry, PlateMaterial } from '../simulation/plate'
import type { RingLayer } from '../simulation/rings'

export type PreviewLayout = 'both' | 'observation' | 'record'
export type ViewMode = 'continuous' | 'camera'
export type FrameInfo = { time: number; sample: number; sampleTime: number; angle: number; exposureSamples: number }

type Props = {
  active: boolean
  layout: PreviewLayout
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
}

export function SimulatorCanvas({ active, layout, mode, playing, fps, exposure, blur, guides, zoom, revision, transport, motion, onFrame, onRotate, material, geometry, rings, observationName, radius, onRadiusChange }: Props) {
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
    if (!active) return
    const plate = textures.get(material, geometry, rings, guides)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const lens = lensRef.current!.getContext('2d')!
    const schedule = new FixedRateSchedule(fps)
    transport.setPlaying(playing, performance.now())
    let request = 0
    let lastRenderedTime = -1
    let lastReport = -Infinity
    let sampleCount = 1

    const draw = (now: number) => {
      const time = transport.timeAt(now)
      const sample = schedule.indexAt(time)
      const sampleTime = schedule.timeAtIndex(sample)
      const renderedTime = mode === 'camera' ? sampleTime : time
      if (renderedTime !== lastRenderedTime) {
        const shutter = mode === 'continuous' && !blur ? 0 : exposure
        sampleCount = renderExposure(ctx, plate, motion, renderedTime, shutter)
        // The inspection window is cropped from the SAME integrated frame, never a separate animation.
        lens.clearRect(0, 0, lens.canvas.width, lens.canvas.height)
        lens.imageSmoothingQuality = 'high'
        lens.drawImage(canvas, canvas.width * observation.x, canvas.height * observation.y,
          canvas.width * observation.width, canvas.height * observation.height,
          0, 0, lens.canvas.width, lens.canvas.height)
        lastRenderedTime = renderedTime
      }
      if (now - lastReport >= 200 || !playing) {
        onFrame({ time, sample, sampleTime, angle: motion.angleAt(renderedTime), exposureSamples: sampleCount })
        lastReport = now
      }
      if (playing) request = requestAnimationFrame(draw)
    }
    draw(performance.now())
    return () => cancelAnimationFrame(request)
  }, [active, textures, mode, playing, fps, exposure, blur, guides, revision, transport, motion, onFrame, observation, material, geometry, rings])

  return (
    <div className="canvas-workspace">
      <div className={layout === 'both' ? 'canvas-panels canvas-panels-both' : `canvas-panels canvas-panels-${layout}`}>
      <section hidden={layout === 'record'} aria-labelledby="observation-title" className="preview-panel observation-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div>
            <h2 id="observation-title" className="text-base font-semibold">观察监视器</h2>
            <p className="mt-1 text-xs text-muted-foreground">{observationName ? `${observationName} · 半径 ${radius}%` : `半径 ${radius}% · 与盘面同源采样`}</p>
          </div>
          <span className="observation-mode">{mode === 'camera' ? '相机采样' : '连续旋转'}</span>
        </div>
        <div className="observation-stage">
          <canvas ref={lensRef} width={Math.round(960 * Math.min(1, observation.width / observation.height))} height={Math.round(960 * Math.min(1, observation.height / observation.width))} data-testid="observation-canvas" className="observation-image" style={{ width: `min(100cqw, ${100 * observation.width / observation.height}cqh)`, height: `min(100cqh, ${100 * observation.height / observation.width}cqw)` }} role="img" aria-label="唱片顶部固定位置的放大观察窗" />
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-muted-foreground sm:px-6">
          <p>逐格同步时，动作在原位接替。轻微失配时，可看到图案沿圆周漂移。</p>
          <p className="mt-1 text-xs">{mode === 'camera' ? '按相机采样时刻更新，曝光拖影与完整盘面一致。' : '连续旋转预览，也受屏幕刷新率影响。'}</p>
        </div>
      </section>

      <section hidden={layout === 'observation'} aria-labelledby="record-title" className="preview-panel record-panel">
        <div className="px-5 pb-3 pt-5 sm:px-6">
          <h2 id="record-title" className="text-base font-semibold">旋转盘面</h2>
          <p className="mt-1 text-xs text-muted-foreground">拖动框内调整半径 · 拖动边缘调整视野</p>
        </div>
        <div className="record-stage">
          <div {...bind()} ref={surfaceRef} role="group" aria-label="唱片搓碟区域，暂停时拖动旋转，左右方向键微调，Shift 加速" tabIndex={0} data-testid="record-surface" className="scratch-surface record-disc relative aspect-square select-none" style={{ transform: `scale(${zoom})`, transformOrigin: '50% 15%', touchAction: playing ? 'auto' : 'none', cursor: playing ? 'default' : scratching ? 'grabbing' : 'grab' }} onKeyDown={(event) => {
            if (!playing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
              event.preventDefault()
              onRotate((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1) * Math.PI / 180)
            }
          }}>
            <canvas ref={canvasRef} width="1024" height="1024" className="block size-full" role="img" aria-label="由完整静态盘面旋转和曝光累积生成的唱片预览" data-testid="record" />
            <ObservationWindow onRadiusChange={onRadiusChange} radius={radius} centerY={centerY} size={{ width: observation.width, height: observation.height }} onChange={setObservationSize} />
          </div>
        </div>
        <p className="px-5 py-4 text-xs leading-6 text-muted-foreground sm:px-6">{playing ? '暂停后可拖动唱片搓碟。' : '拖动旋转 · ← → 微调 · Shift 加速'}</p>
      </section>
      </div>
    </div>
  )
}
