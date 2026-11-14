import { FloatingObservation } from '../components/FloatingObservation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Columns2, Disc3, Scan, SlidersHorizontal, Layers3, Focus, Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCallback, useImperativeHandle, useId, useMemo, useState } from 'react'
import type { Ref } from 'react'
import { SimulatorCanvas } from '../components/SimulatorCanvas'
import { CdDriveEditor } from '../components/CdDriveEditor'
import { CdRotation, DEFAULT_CD } from '../simulation/cd'
import type { CdConfig } from '../simulation/cd'
import { RingEditor } from '../components/RingEditor'
import { createDefaultRings, referenceRing, sameRingLayout } from '../simulation/rings'
import type { RingLayer } from '../simulation/rings'
import { PlateEditor } from '../components/PlateEditor'
import { EXAMPLES } from '../simulation/plate'
import type { PlateGeometry, PlateMaterial, WorkbenchPlan } from '../simulation/plate'
import type { DeckView, DeckAction, DeckTransportState } from '../scene/turntable'
import type { FrameInfo, ViewMode } from '../components/SimulatorCanvas'
import { FixedRateSchedule, matchedFps, MAX_EXPOSURE_SAMPLES, PLATE, RotationTimeline, sampleMatch, turnsPerSample, Transport } from '../simulation/model'

const modes: { value: ViewMode; label: string }[] = [
  { value: 'continuous', label: '连续旋转' }, { value: 'camera', label: '相机采样' },
]
const presets = [{ label: '33⅓', rpm: 100 / 3 }, { label: '45', rpm: 45 }, { label: '78', rpm: 78 }]
const exposures = [{ value: '0.0005', label: '1/2000 秒' }, { value: '0.001', label: '1/1000 秒' }, { value: '0.004', label: '1/250 秒' }, { value: '0.008333333333333333', label: '1/120 秒' }, { value: '0.016666666666666666', label: '1/60 秒' }, { value: 'frame', label: '一整帧（最长曝光）' }]
const displayRpm = (rpm: number) => rpm === 100 / 3 ? '33⅓' : rpm.toFixed(2).replace(/\.?0+$/, '')

function ModeSelector<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const name = useId()
  return <div role="radiogroup" aria-label={label} className="mode-selector">
    {options.map((option) => <label key={option.value}>
      <input type="radio" className="sr-only" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      {option.label}
    </label>)}
  </div>
}

export type WorkbenchControls = { pause: () => void; applyPlan: (plan: WorkbenchPlan) => void }

export function HomePage({ ref, active, initialPlan }: {
  ref: Ref<WorkbenchControls>
  active: boolean
  initialPlan: WorkbenchPlan | null
}) {
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null)
  const [pressedControl, setPressedControl] = useState<DeckAction | null>(null)
  const [transportHost, setTransportHost] = useState<HTMLDivElement | null>(null)
  const [sceneView, setSceneView] = useState<DeckView>('overview')
  const [observationHost, setObservationHost] = useState<HTMLDivElement | null>(null)
  const [dropMessage, setDropMessage] = useState('')
  const [inspector, setInspector] = useState('motion')
  const [motion, setMotion] = useState<RotationTimeline | CdRotation>(() => new RotationTimeline(initialPlan?.rpm))
  const [drive, setDrive] = useState<'constant' | 'cd'>('constant')
  const [cdConfig, setCdConfig] = useState<CdConfig>({ ...DEFAULT_CD })
  const [transport] = useState(() => new Transport())
  const [material, setMaterial] = useState<PlateMaterial>({ kind: 'example', example: 'bounce' })
  const [geometry, setGeometry] = useState<PlateGeometry>(() => initialPlan?.geometry ?? { ...PLATE })
  const materialName = material.kind === 'image' ? material.name : EXAMPLES.find((example) => example.id === material.example)!.name
  const [multiRing, setMultiRing] = useState(false)
  const [rings, setRings] = useState<RingLayer[]>(createDefaultRings)
  const [referenceId, setReferenceId] = useState('outer')
  const [observed, setObserved] = useState({ id: 'outer', request: 0 })
  const reference = referenceRing(rings, referenceId)
  const observedRing = rings.find((ring) => ring.enabled && ring.id === observed.id) ?? reference
  const activeGeometry = multiRing ? reference?.geometry ?? geometry : geometry
  const [mode, setMode] = useState<ViewMode>('camera')
  const [playing, setPlaying] = useState(false)
  const [rpm, setRpm] = useState(initialPlan?.rpm ?? 100 / 3)
  const [direction, setDirection] = useState(1)
  const [automatic, setAutomatic] = useState(true)
  const [manualFps, setManualFps] = useState(30)
  const [shutter, setShutter] = useState('0.001')
  const [guides, setGuides] = useState(false)
  const [blur, setBlur] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [revision, setRevision] = useState(0)
  const [frame, setFrame] = useState<FrameInfo>({ time: 0, sample: 0, sampleTime: 0, angle: 0, exposureSamples: 1 })
  const canPrevious = mode === 'camera' && !playing && frame.sample > 0
  const canNext = mode === 'camera' && !playing
  const controlState = useMemo<DeckTransportState>(() => ({ playing, canPrevious, canNext, pressed: pressedControl }), [playing, canPrevious, canNext, pressedControl])
  const onFrame = useCallback((info: FrameInfo) => setFrame(info), [])
  const rotateBy = useCallback((radians: number) => {
    motion.rotateBy(radians)
    setRevision((value) => value + 1)
  }, [motion])
  const renderedTime = mode === 'camera' ? frame.sampleTime : frame.time
  const liveRpm = Math.abs(motion.rpmAt(renderedTime))
  const initialRpm = drive === 'cd' ? Math.abs(motion.rpmAt(0)) : rpm
  const fps = automatic ? matchedFps(initialRpm, activeGeometry.slots) : manualFps
  const maxFps = Math.max(120, Math.ceil(matchedFps(Math.max(initialRpm, liveRpm), activeGeometry.slots) * 1.1), Math.ceil(manualFps))
  const requestedExposure = shutter === 'frame' ? 1 / fps : Number(shutter)
  const exposure = Math.min(requestedExposure, 1 / fps)
  const turns = turnsPerSample(motion, frame.sampleTime, fps)
  const match = sampleMatch(turns, activeGeometry.slots, drive === 'cd')

  const changeSpeed = (speed: number, sign = direction) => {
    if (motion instanceof RotationTimeline) motion.setSpeedAt(transport.timeAt(performance.now()), speed * sign)
    setRpm(speed)
    setDirection(sign)
    setRevision((value) => value + 1)
  }
  const applyDrive = (next: 'constant' | 'cd', config = cdConfig, sign = direction) => {
    const now = performance.now()
    transport.setPlaying(false, now)
    transport.seek(0, now)
    setPlaying(false)
    setDrive(next)
    setCdConfig(config)
    setDirection(sign)
    setMotion(next === 'cd' ? new CdRotation(config, sign) : new RotationTimeline(rpm * sign))
    setFrame({ time: 0, sample: 0, sampleTime: 0, angle: 0, exposureSamples: 1 })
    setRevision((value) => value + 1)
  }
  const changeMode = (next: ViewMode) => setMode(next)
  const step = (delta: number) => {
    const now = performance.now()
    transport.setPlaying(false, now)
    const schedule = new FixedRateSchedule(fps)
    transport.seek(schedule.timeAtIndex(schedule.indexAt(transport.timeAt(now)) + delta), now)
    setPlaying(false)
    setRevision((value) => value + 1)
  }
  const reset = useCallback(() => {
    const now = performance.now()
    const signedRpm = motion.rpmAt(transport.timeAt(now))
    transport.setPlaying(false, now)
    transport.seek(0, now)
    motion.reset(signedRpm)
    if (motion instanceof RotationTimeline) {
      setRpm(Math.abs(signedRpm))
      setDirection(Math.sign(signedRpm))
    }
    setPlaying(false)
    setRevision((value) => value + 1)
  }, [motion, transport, setPlaying, setRevision])
  useImperativeHandle(ref, () => ({
    pause() {
      transport.setPlaying(false, performance.now())
      setPlaying(false)
    },
    applyPlan(plan) {
      const now = performance.now()
      transport.setPlaying(false, now)
      transport.seek(0, now)
      setPlaying(false)
      setGeometry(plan.geometry)
      setMultiRing(false)
      setDrive('constant')
      setMotion(new RotationTimeline(plan.rpm))
      setRpm(plan.rpm)
      setDirection(1)
      setMode('camera')
      setAutomatic(true)
      setShutter('0.001')
    },
  }), [transport])

  const selectMaterial = useCallback((next: PlateMaterial, nextGeometry?: PlateGeometry) => {
    reset()
    setMaterial(next)
    if (nextGeometry) setGeometry(nextGeometry)
  }, [reset])
  const changeGeometry = useCallback((next: PlateGeometry) => {
    reset()
    setGeometry(next)
  }, [reset])

  const changeRings = useCallback((next: RingLayer[]) => {
    if (!sameRingLayout(rings, next)) reset()
    setRings(next)
  }, [rings, reset])
  const observeRing = useCallback((id: string) => setObserved((value) => ({ id, request: value.request + 1 })), [])
  const changeReference = useCallback((id: string) => { setReferenceId(id) }, [])
  const [singleRadius, setSingleRadius] = useState(75)
  const [ringRadius, setRingRadius] = useState<{ target: string; value: number } | null>(null)
  const observationTarget = multiRing && observedRing ? { key: `${observedRing.id}:${observedRing.inner}:${observedRing.outer}:${observed.request}`, name: observedRing.name, radius: (observedRing.inner + observedRing.outer) / 2 } : undefined

  const observationRadius = observationTarget
    ? (ringRadius?.target === observationTarget.key ? ringRadius.value : observationTarget.radius)
    : singleRadius
  const moveObservation = (value: number) => {
    const radius = Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
    if (observationTarget) setRingRadius({ target: observationTarget.key, value: radius })
    else setSingleRadius(radius)
  }

  const selectInspector = (value: string) => {
    setInspector(value)
    const viewport = controlsHost?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (viewport) viewport.scrollTop = 0
  }

  const cameraConfiguration = <div className="camera-configuration">
            <section id="camera-settings" className="min-w-0 space-y-4 p-5" aria-labelledby="camera-title"><h3 id="camera-title" className="text-sm font-semibold">相机配置</h3>
              <ModeSelector label="观察方式" value={mode} options={modes} onChange={changeMode} />
                <div className="flex items-center gap-2"><Switch id="blur" checked={blur} disabled={mode !== 'continuous'} onCheckedChange={setBlur} /><Label htmlFor="blur">连续旋转拖影</Label></div>

              <div className="flex items-center justify-between gap-3"><Label htmlFor="auto-fps">{drive === 'cd' ? '匹配起始转速' : '自动匹配'}</Label><Switch id="auto-fps" checked={automatic} onCheckedChange={(checked) => { setManualFps(fps); setAutomatic(checked) }} /></div>
              {drive === 'cd' && <div className="space-y-2"><p className="text-xs leading-5 text-muted-foreground">相机保持固定帧率，不随电机变速。起始匹配后出现漂移是预期现象。</p><Button variant="outline" size="sm" onClick={() => { setManualFps(matchedFps(liveRpm, activeGeometry.slots)); setAutomatic(false) }}>匹配当前转速</Button></div>}
              <div className="flex items-center justify-between gap-3"><Label htmlFor="camera-fps">采样率</Label><div className="flex items-center gap-2"><Input id="camera-fps" type="number" min="0.1" max={maxFps} step="any" value={Number(fps.toFixed(3))} disabled={automatic} onChange={(event) => { const value = Number(event.target.value); if (value >= 0.1 && value <= maxFps) setManualFps(value) }} className="w-24 text-right tabular-nums" /><span className="text-xs text-muted-foreground">fps</span></div></div>
              <Slider aria-label="手动采样率" min={0.1} max={maxFps} step={0.1} value={[fps]} disabled={automatic} onValueChange={([value]) => setManualFps(value)} />
              <div className="flex items-center justify-between gap-3"><Label htmlFor="shutter" className="shrink-0">曝光时间</Label><Select value={shutter} onValueChange={setShutter}><SelectTrigger size="sm" id="shutter" aria-label="曝光时间" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{exposures.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <p className="text-xs leading-5 text-muted-foreground">实际 {(exposure * 1000).toFixed(2)} ms · 上限为一个采样周期</p>
              <div className="flex flex-wrap items-center justify-between gap-1 rounded-md bg-muted px-2 py-2 text-xs" data-testid="sync-status"><strong className="flex items-center gap-1.5 font-medium"><span className={`size-1.5 rounded-full ${match.synchronized ? 'bg-primary' : 'bg-destructive'}`} />{multiRing && !reference ? '没有启用圆环' : match.label}</strong><span className="text-muted-foreground tabular-nums">{match.advance.toFixed(3)} 格 / 采样</span></div>
            </section>
          <section className="sidebar-subsection" aria-labelledby="experiments-title"><h3 id="experiments-title" className="mb-3 text-sm font-semibold">快速实验</h3>
            <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" onClick={() => { changeMode('camera'); setManualFps(matchedFps(liveRpm, activeGeometry.slots) * 1.02); setAutomatic(false); setShutter('0.001') }}>轻微失配</Button><Button variant="secondary" size="sm" onClick={() => { changeMode('camera'); setShutter('frame') }}>延长曝光</Button><Button variant="ghost" size="sm" onClick={() => { changeMode('camera'); setAutomatic(true); setShutter('0.001') }}>{drive === 'cd' ? '恢复起始匹配' : '恢复清晰同步'}</Button></div>
          </section>
  </div>

  return (
    <div className="workbench" data-view={sceneView} data-inspector={inspector}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDrop={event => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        selectInspector('material')
        const prefix = multiRing && observedRing ? `ring-${observedRing.id}` : 'single'
        const input = document.querySelector<HTMLInputElement>(`#${prefix}-editor input[type="file"]`)
        if (!input) { setDropMessage('请先展开目标圆环，再拖入图片。'); return }
        input.files = event.dataTransfer.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        setDropMessage('')
      }}>
      {dropMessage && <p role="status" className="drop-feedback">{dropMessage}</p>}
      <FloatingObservation settings={cameraConfiguration}><div ref={setObservationHost} className="inspector-monitor" /></FloatingObservation>
      <aside ref={setControlsHost} aria-label="工作台配置" className="workbench-sidebar instrument-controls">
        <div className="instrument-panel-heading"><span>实验控制</span><span className="operator-panel-indicator">●</span></div>
        <div className="inspector-tabs" role="group" aria-label="参数面板">
          {([
            ['motion', '运动参数', SlidersHorizontal, '参数'],
            ['material', '素材与结构', Layers3, '素材'],
            ['inspection', '检查工具', Focus, '检查'],
          ] as const).map(([value, label, Icon, text]) => <Tooltip key={value}><TooltipTrigger asChild>
            <Button size="sm" variant={inspector === value ? 'secondary' : 'ghost'} aria-label={label} aria-pressed={inspector === value} onClick={() => selectInspector(value)}><Icon className="size-4" /><span>{text}</span></Button>
          </TooltipTrigger><TooltipContent side="left">{label}</TooltipContent></Tooltip>)}
        </div>
        <ScrollArea className="sidebar-scroll" type="scroll" scrollHideDelay={600}>
          <section className="sidebar-group" data-panel="motion" hidden={inspector !== 'motion'} aria-label="运动参数">

          <div className="sidebar-parameters">
            <section id="motion-settings" className="min-w-0 space-y-4 p-5" aria-labelledby="motion-title"><h3 id="motion-title" className="text-sm font-semibold">唱片运动</h3>
              <ModeSelector label="旋转驱动" value={drive} options={[{ value: 'constant', label: '恒定转速' }, { value: 'cd', label: 'CD 受控变速' }]} onChange={(value) => applyDrive(value)} />
              {drive === 'constant' ? <div className="space-y-4">
              <div className="flex items-baseline justify-between"><Label htmlFor="rotation-speed">转速</Label><output htmlFor="rotation-speed" className="text-base font-semibold tabular-nums">{displayRpm(rpm)} <span className="text-xs font-normal text-muted-foreground">RPM</span></output></div>
              <Slider id="rotation-speed" aria-label="转速" min={1} max={78} step={0.01} value={[rpm]} onValueChange={([value]) => changeSpeed(value)} />

              <div role="group" aria-label="常用转速" className="flex gap-2">{presets.map((preset) => <Button key={preset.label} variant={rpm === preset.rpm ? 'default' : 'outline'} size="sm" aria-pressed={rpm === preset.rpm} onClick={() => changeSpeed(preset.rpm)} className="flex-1">{preset.label}</Button>)}</div>
              </div> : motion instanceof CdRotation && <CdDriveEditor model={motion} time={renderedTime} onApply={(config) => applyDrive('cd', config)} />}
              <div className="flex items-center justify-between gap-3"><Label htmlFor="direction">旋转方向</Label><Select value={String(direction)} onValueChange={(value) => drive === 'cd' ? applyDrive('cd', cdConfig, Number(value)) : changeSpeed(rpm, Number(value))}><SelectTrigger size="sm" id="direction" aria-label="旋转方向" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">顺时针</SelectItem><SelectItem value="-1">逆时针</SelectItem></SelectContent></Select></div>
            </section>

          </div>

          </section>
          <section className="sidebar-group" data-panel="inspection" hidden={inspector !== 'inspection'} aria-label="观察与检查">

          <section aria-labelledby="inspection-title" className="sidebar-subsection">
              <h3 id="inspection-title" className="mb-4 flex items-center gap-2 text-sm font-semibold">检查工具</h3>
              <div className="flex flex-col items-start gap-4 pb-4">
                <div className="flex items-center gap-2"><Switch id="guides" checked={guides} onCheckedChange={setGuides} /><Label htmlFor="guides">{multiRing ? '各圈位置与动作帧编号' : material.kind === 'image' ? '圆周位置编号（声明格数）' : '位置与动作帧编号'}</Label></div>

                <div className="flex items-center gap-2"><Label htmlFor="observation-radius">观察半径（%）</Label>
                  <Input id="observation-radius" type="number" min={0} max={100} step="any" className="w-20" value={observationRadius} onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber)) moveObservation(event.target.valueAsNumber)
                  }} />
                </div>
                <div className="flex items-center gap-3"><Label htmlFor="zoom">预览放大</Label><Slider id="zoom" aria-label="预览放大" className="w-24" min={1} max={2} step={0.1} value={[zoom]} onValueChange={([value]) => setZoom(value)} /><span className="text-xs tabular-nums">{zoom.toFixed(1)}×</span><Button variant="ghost" size="sm" onClick={() => setZoom(1)}>复位</Button></div>
              </div>

              {frame.exposureSamples >= MAX_EXPOSURE_SAMPLES && <p role="status" className="mt-2 text-xs leading-6 text-muted-foreground">已达到曝光积分的 {MAX_EXPOSURE_SAMPLES} 次采样上限，长拖影可能出现离散重影。请缩短曝光以提高精度。</p>}
              {fps > 60 && <p className="mt-2 text-xs leading-6 text-muted-foreground">当前采样率超过 60 fps；较低刷新率屏幕可能无法显示每一帧，可暂停后逐帧检查。</p>}
          </section>

          </section>
          <section className="sidebar-group" data-panel="material" hidden={inspector !== 'material'} aria-label="素材与结构">

        <div id="plate-editor" className="sidebar-material min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-4"><Label>盘面类型</Label><ModeSelector label="盘面类型" value={multiRing ? 'rings' : 'single'} options={[{ value: 'single', label: '单盘面' }, { value: 'rings', label: '多圆环' }]} onChange={(value) => { reset(); setMultiRing(value === 'rings') }} /></div>
          <div hidden={multiRing}><PlateEditor idPrefix="single" material={material} geometry={geometry} onSelect={selectMaterial} onGeometryChange={changeGeometry} /></div>
          <div hidden={!multiRing}><RingEditor turns={turns} variableSpeed={drive === 'cd'} rings={rings} fps={fps} rpm={liveRpm} referenceId={reference?.id} observedId={observedRing?.id} onChange={changeRings} onReference={changeReference} onObserve={observeRing} /></div>
        </div>

          </section>

        </ScrollArea>
        <div className="workspace-status" aria-label="实验运行状态">
          <span role="status" className="flex shrink-0 items-center gap-1.5 text-xs"><span className={`size-1.5 rounded-full ${playing ? 'bg-primary' : 'bg-muted-foreground'}`} />{playing ? '正在播放' : '已暂停'}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{mode === 'camera' ? '相机采样' : '连续旋转'} · {drive === 'cd' ? 'CD · ' : ''}{displayRpm(liveRpm)} RPM · {Number(fps.toFixed(3))} fps · {(exposure * 1000).toFixed(2)} ms</span>
          <details className="sampling-details"><summary>采样详情</summary><output data-testid="simulation-metrics" className="ml-auto text-xs text-muted-foreground tabular-nums">时间 {frame.time.toFixed(3)} s · 帧 {frame.sample} @ {frame.sampleTime.toFixed(3)} s · 角度 {((frame.angle * 180 / Math.PI % 360 + 360) % 360).toFixed(2)}° · 积分 {frame.exposureSamples} 次</output></details>
        </div>
      </aside>
      <nav className="scene-navigation" aria-label="仪器视角">
        {([
          ['overview', '全景', Columns2],
          ['disc', '盘面俯视', Disc3],
          ['monitor', '观察特写', Scan],
        ] as const).map(([value, label, Icon]) => <Button key={value} variant={sceneView === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={sceneView === value} onClick={() => setSceneView(value)}><Icon />{label}</Button>)}
      </nav>
      <section id="simulator" aria-label="Zoetrope 模拟器" className="workbench-main">
        <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5">
          <h1 className="text-sm font-semibold">唱片工作台</h1>
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground"><span className="max-w-48 truncate">{multiRing ? `多圆环 · ${rings.filter((ring) => ring.enabled).length}/${rings.length} 圈启用` : materialName}</span><span>{multiRing ? `同步参考：${reference?.name ?? '无'}` : `${geometry.slots} 格 / ${geometry.frames} 帧 × ${geometry.repeats}`}</span></div>
        </div>
        <div className="workbench-preview">
            <div ref={setTransportHost} className="machine-transport" role="group" aria-label="唱机实体按键">
              {([
                { action: 'play', label: playing ? '暂停' : '播放', Icon: playing ? Pause : Play, disabled: false, active: playing, run: () => setPlaying(value => !value) },
                { action: 'previous', label: '上一采样帧', text: '上一帧', Icon: StepBack, disabled: !canPrevious, run: () => step(-1) },
                { action: 'next', label: '下一采样帧', text: '下一帧', Icon: StepForward, disabled: !canNext, run: () => step(1) },
                { action: 'reset', label: '复位', Icon: RotateCcw, disabled: false, run: reset },
              ] as const).map(key => <Button key={key.action} data-action={key.action} variant="ghost" aria-label={key.label}
                aria-pressed={'active' in key ? key.active : undefined} disabled={key.disabled}
                onPointerDown={event => { setPressedControl(key.action); event.currentTarget.setPointerCapture(event.pointerId) }}
                onPointerUp={() => setPressedControl(null)} onPointerCancel={() => setPressedControl(null)} onLostPointerCapture={() => setPressedControl(null)}
                onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') setPressedControl(key.action) }}
                onKeyUp={() => setPressedControl(null)} onBlur={() => setPressedControl(null)}
                onClick={() => { setPressedControl(null); key.run() }}>
                <key.Icon /><span className="machine-button-label">{'text' in key ? key.text : key.label}</span>
              </Button>)}
            </div>
            {multiRing && !reference && <p role="status" className="border-b bg-muted px-4 py-3 text-sm">没有启用圆环。请在多圆环编辑中启用至少一圈。</p>}
            {!multiRing && material.kind === 'example' && material.example === 'seam' && <p role="status" className="border-b bg-muted px-4 py-3 text-sm">接缝错误对照：最后一帧故意重复首帧。即使格距同步，仍会出现跳步和停顿。</p>}
            <SimulatorCanvas controlState={controlState} view={sceneView} onViewChange={setSceneView} controlsHost={controlsHost} transportHost={transportHost} onInspectDisc={radius => {
              selectInspector('material')
              if (multiRing) {
                const ring = rings.find(item => item.enabled && radius >= item.inner && radius <= item.outer)
                if (ring) observeRing(ring.id)
              }
            }} observationHost={observationHost} onPlay={() => setPlaying(value => !value)} active={active} mode={mode} playing={playing} fps={fps} exposure={exposure} blur={blur} guides={guides} zoom={zoom} revision={revision} transport={transport} motion={motion} onFrame={onFrame} onRotate={rotateBy} material={material} geometry={geometry} rings={multiRing ? rings : undefined} observationName={observationTarget?.name} radius={observationRadius} onRadiusChange={moveObservation} />

        </div>

      </section>
    </div>
  )
}
