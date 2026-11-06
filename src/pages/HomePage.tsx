import { ScrollArea } from '@/components/ui/scroll-area'
import { Columns2, Disc3, Scan, Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCallback, useState } from 'react'
import { SimulatorCanvas } from '../components/SimulatorCanvas'
import { CdDriveEditor } from '../components/CdDriveEditor'
import { CdRotation, DEFAULT_CD } from '../simulation/cd'
import type { CdConfig } from '../simulation/cd'
import { RingEditor } from '../components/RingEditor'
import { createDefaultRings, referenceRing } from '../simulation/rings'
import type { RingLayer } from '../simulation/rings'
import { PlateEditor } from '../components/PlateEditor'
import { EXAMPLES } from '../simulation/plate'
import type { PlateGeometry, PlateMaterial } from '../simulation/plate'
import type { FrameInfo, PreviewLayout, ViewMode } from '../components/SimulatorCanvas'
import { FixedRateSchedule, matchedFps, PLATE, RotationTimeline, slotsPerSample, Transport } from '../simulation/model'

const modes: { value: ViewMode; label: string }[] = [
  { value: 'continuous', label: '连续旋转' }, { value: 'camera', label: '相机采样' },
]
const presets = [{ label: '33⅓', rpm: 100 / 3 }, { label: '45', rpm: 45 }, { label: '78', rpm: 78 }]
const exposures = [{ value: '0.0005', label: '1/2000 秒' }, { value: '0.001', label: '1/1000 秒' }, { value: '0.004', label: '1/250 秒' }, { value: '0.008333333333333333', label: '1/120 秒' }, { value: '0.016666666666666666', label: '1/60 秒' }, { value: 'frame', label: '一整帧（最长曝光）' }]
const displayRpm = (rpm: number) => rpm === 100 / 3 ? '33⅓' : rpm.toFixed(2).replace(/\.?0+$/, '')

export function HomePage() {
  const [motion, setMotion] = useState<RotationTimeline | CdRotation>(() => new RotationTimeline())
  const [drive, setDrive] = useState<'constant' | 'cd'>('constant')
  const [cdConfig, setCdConfig] = useState<CdConfig>({ ...DEFAULT_CD })
  const [transport] = useState(() => new Transport())
  const [material, setMaterial] = useState<PlateMaterial>({ kind: 'example', example: 'bounce' })
  const [geometry, setGeometry] = useState<PlateGeometry>(() => ({ ...PLATE }))
  const materialName = material.kind === 'image' ? material.name : EXAMPLES.find((example) => example.id === material.example)!.name
  const [multiRing, setMultiRing] = useState(false)
  const [rings, setRings] = useState<RingLayer[]>(createDefaultRings)
  const [referenceId, setReferenceId] = useState('outer')
  const [observed, setObserved] = useState({ id: 'outer', request: 0 })
  const reference = referenceRing(rings, referenceId)
  const observedRing = rings.find((ring) => ring.enabled && ring.id === observed.id) ?? reference
  const activeGeometry = multiRing ? reference?.geometry ?? geometry : geometry
  const [layout, setLayout] = useState<PreviewLayout>('both')
  const [mode, setMode] = useState<ViewMode>('camera')
  const [playing, setPlaying] = useState(false)
  const [rpm, setRpm] = useState(100 / 3)
  const [direction, setDirection] = useState(1)
  const [automatic, setAutomatic] = useState(true)
  const [manualFps, setManualFps] = useState(30)
  const [shutter, setShutter] = useState('0.001')
  const [guides, setGuides] = useState(false)
  const [blur, setBlur] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [revision, setRevision] = useState(0)
  const [frame, setFrame] = useState<FrameInfo>({ time: 0, sample: 0, sampleTime: 0, angle: 0, exposureSamples: 1 })
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
  const advance = frame.sampleTime > 0 ? Math.abs(motion.angleAt(frame.sampleTime) - motion.angleAt(Math.max(0, frame.sampleTime - 1 / fps))) * activeGeometry.slots / (2 * Math.PI) : Math.abs(slotsPerSample(liveRpm, fps, activeGeometry.slots))
  const synchronized = Math.abs(advance - 1) < (drive === 'cd' ? 0.0005 : 0.00001)

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
    setPlaying(false)
    setRevision((value) => value + 1)
  }, [motion, transport, setPlaying, setRevision])
  const selectMaterial = useCallback((next: PlateMaterial, nextGeometry?: PlateGeometry) => {
    reset()
    setMaterial(next)
    if (nextGeometry) setGeometry(nextGeometry)
  }, [reset])
  const changeGeometry = useCallback((next: PlateGeometry) => {
    reset()
    setGeometry(next)
  }, [reset])

  const changeRings = useCallback((next: RingLayer[]) => { reset(); setRings(next) }, [reset])
  const observeRing = useCallback((id: string) => setObserved((value) => ({ id, request: value.request + 1 })), [])
  const changeReference = useCallback((id: string) => { setReferenceId(id) }, [])
  const observationTarget = multiRing && observedRing ? { key: `${observedRing.id}:${observedRing.inner}:${observedRing.outer}:${observed.request}`, name: observedRing.name, radius: (observedRing.inner + observedRing.outer) / 2 } : undefined

  return (
    <div className="workbench">
      <aside aria-label="工作台配置" className="workbench-sidebar">
        <ScrollArea className="sidebar-scroll" type="scroll" scrollHideDelay={600}>
          <section className="sidebar-group" aria-labelledby="playback-group-title">
            <header className="sidebar-group-heading"><h2 id="playback-group-title">运动与采样</h2></header>
          <div className="sidebar-parameters">
            <section id="motion-settings" className="min-w-0 space-y-4 p-5" aria-labelledby="motion-title"><h3 id="motion-title" className="text-sm font-semibold">唱片运动</h3>
              <Tabs value={drive} onValueChange={(value) => applyDrive(value as 'constant' | 'cd')}><TabsList aria-label="旋转驱动" className="w-full"><TabsTrigger value="constant" className="flex-1">恒定转速</TabsTrigger><TabsTrigger value="cd" className="flex-1">CD 受控变速</TabsTrigger></TabsList></Tabs>
              {drive === 'constant' ? <div className="space-y-4">
              <div className="flex items-baseline justify-between"><Label htmlFor="rotation-speed">转速</Label><output htmlFor="rotation-speed" className="text-base font-semibold tabular-nums">{displayRpm(rpm)} <span className="text-xs font-normal text-muted-foreground">RPM</span></output></div>
              <Slider id="rotation-speed" aria-label="转速" min={1} max={78} step={0.01} value={[rpm]} onValueChange={([value]) => changeSpeed(value)} />

              <div role="group" aria-label="常用转速" className="flex gap-2">{presets.map((preset) => <Button key={preset.label} variant={rpm === preset.rpm ? 'default' : 'outline'} size="sm" aria-pressed={rpm === preset.rpm} onClick={() => changeSpeed(preset.rpm)} className="flex-1">{preset.label}</Button>)}</div>
              </div> : motion instanceof CdRotation && <CdDriveEditor model={motion} time={renderedTime} onApply={(config) => applyDrive('cd', config)} />}
              <div className="flex items-center justify-between gap-3"><Label htmlFor="direction">旋转方向</Label><Select value={String(direction)} onValueChange={(value) => drive === 'cd' ? applyDrive('cd', cdConfig, Number(value)) : changeSpeed(rpm, Number(value))}><SelectTrigger size="sm" id="direction" aria-label="旋转方向" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">顺时针</SelectItem><SelectItem value="-1">逆时针</SelectItem></SelectContent></Select></div>
            </section>
            <section id="camera-settings" className="min-w-0 space-y-4 p-5" aria-labelledby="camera-title"><h3 id="camera-title" className="text-sm font-semibold">相机配置</h3>
              <Tabs value={mode} onValueChange={(value) => changeMode(value as ViewMode)}><TabsList aria-label="观察方式" className="w-full">{modes.map((item) => <TabsTrigger key={item.value} value={item.value} className="flex-1">{item.label}</TabsTrigger>)}</TabsList></Tabs>

              <div className="flex items-center justify-between gap-3"><Label htmlFor="auto-fps">{drive === 'cd' ? '匹配起始转速' : '自动匹配'}</Label><Switch id="auto-fps" checked={automatic} onCheckedChange={(checked) => { setManualFps(fps); setAutomatic(checked) }} /></div>
              {drive === 'cd' && <div className="space-y-2"><p className="text-xs leading-5 text-muted-foreground">相机保持固定帧率，不随电机变速。起始匹配后出现漂移是预期现象。</p><Button variant="outline" size="sm" onClick={() => { setManualFps(matchedFps(liveRpm, activeGeometry.slots)); setAutomatic(false) }}>匹配当前转速</Button></div>}
              <div className="flex items-center justify-between gap-3"><Label htmlFor="camera-fps">采样率</Label><div className="flex items-center gap-2"><Input id="camera-fps" type="number" min="0.1" max={maxFps} step="any" value={Number(fps.toFixed(3))} disabled={automatic} onChange={(event) => { const value = Number(event.target.value); if (value >= 0.1 && value <= maxFps) setManualFps(value) }} className="w-24 text-right tabular-nums" /><span className="text-xs text-muted-foreground">fps</span></div></div>
              <Slider aria-label="手动采样率" min={0.1} max={maxFps} step={0.1} value={[fps]} disabled={automatic} onValueChange={([value]) => setManualFps(value)} />
              <div className="flex items-center justify-between gap-3"><Label htmlFor="shutter" className="shrink-0">曝光时间</Label><Select value={shutter} onValueChange={setShutter}><SelectTrigger size="sm" id="shutter" aria-label="曝光时间" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{exposures.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <p className="text-xs leading-5 text-muted-foreground">实际 {(exposure * 1000).toFixed(2)} ms · 上限为一个采样周期</p>
              <div className="flex flex-wrap items-center justify-between gap-1 rounded-md bg-muted px-2 py-2 text-xs" data-testid="sync-status"><strong className="flex items-center gap-1.5 font-medium"><span className={`size-1.5 rounded-full ${synchronized ? 'bg-primary' : 'bg-destructive'}`} />{multiRing && !reference ? '没有启用圆环' : synchronized ? drive === 'cd' ? '近似逐格同步' : '逐格同步' : '采样失配'}</strong><span className="text-muted-foreground tabular-nums">{advance.toFixed(3)} 格 / 采样</span></div>
            </section>
          </div>
          <section className="sidebar-subsection" aria-labelledby="experiments-title"><h3 id="experiments-title" className="mb-3 text-sm font-semibold">快速实验</h3>
            <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" onClick={() => { changeMode('camera'); setManualFps(matchedFps(liveRpm, activeGeometry.slots) * 1.02); setAutomatic(false); setShutter('0.001') }}>轻微失配</Button><Button variant="secondary" size="sm" onClick={() => { changeMode('camera'); setShutter('frame') }}>延长曝光</Button><Button variant="ghost" size="sm" onClick={() => { changeMode('camera'); setAutomatic(true); setShutter('0.001') }}>{drive === 'cd' ? '恢复起始匹配' : '恢复清晰同步'}</Button></div>
          </section>
          </section>
          <section className="sidebar-group" aria-labelledby="view-group-title">
            <header className="sidebar-group-heading"><h2 id="view-group-title">观察与检查</h2></header>
          <section aria-labelledby="inspection-title" className="sidebar-subsection">
              <h3 id="inspection-title" className="mb-4 flex items-center gap-2 text-sm font-semibold">检查工具</h3>
              <div className="flex flex-col items-start gap-4 pb-4">
                <div className="flex items-center gap-2"><Switch id="guides" checked={guides} onCheckedChange={setGuides} /><Label htmlFor="guides">{multiRing ? '各圈位置与动作帧编号' : material.kind === 'image' ? '圆周位置编号（声明格数）' : '位置与动作帧编号'}</Label></div>
                <div className="flex items-center gap-2"><Switch id="blur" checked={blur} disabled={mode !== 'continuous'} onCheckedChange={setBlur} /><Label htmlFor="blur">连续旋转拖影</Label></div>
                <div className="flex items-center gap-3"><Label htmlFor="zoom">预览放大</Label><Slider id="zoom" aria-label="预览放大" className="w-24" min={1} max={2} step={0.1} value={[zoom]} onValueChange={([value]) => setZoom(value)} /><span className="text-xs tabular-nums">{zoom.toFixed(1)}×</span><Button variant="ghost" size="sm" onClick={() => setZoom(1)}>复位</Button></div>
              </div>

              {frame.exposureSamples >= 96 && <p role="status" className="mt-2 text-xs leading-6 text-muted-foreground">已达到曝光积分的 96 次采样上限，长拖影可能出现离散重影。请缩短曝光以提高精度。</p>}
              {fps > 60 && <p className="mt-2 text-xs leading-6 text-muted-foreground">当前采样率超过 60 fps；较低刷新率屏幕可能无法显示每一帧，可暂停后逐帧检查。</p>}
          </section>

          </section>
          <section className="sidebar-group" aria-labelledby="material-group-title">
            <header className="sidebar-group-heading"><h2 id="material-group-title">素材与结构</h2></header>
        <div id="plate-editor" className="sidebar-material min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-4"><Label>盘面类型</Label><Tabs value={multiRing ? 'rings' : 'single'} onValueChange={(value) => { reset(); setMultiRing(value === 'rings') }}><TabsList aria-label="盘面类型"><TabsTrigger value="single">单盘面</TabsTrigger><TabsTrigger value="rings">多圆环</TabsTrigger></TabsList></Tabs></div>
          <div hidden={multiRing}><PlateEditor idPrefix="single" material={material} geometry={geometry} onSelect={selectMaterial} onGeometryChange={changeGeometry} /></div>
          <div hidden={!multiRing}><RingEditor rings={rings} fps={fps} rpm={liveRpm} referenceId={reference?.id} observedId={observedRing?.id} onChange={changeRings} onReference={changeReference} onObserve={observeRing} /></div>
        </div>

          </section>
          <p className="p-5 text-xs leading-5 text-muted-foreground">模拟固定帧率相机与全局快门。曝光通过旋转位置加权累积近似生成，不使用页面频闪。</p>
        </ScrollArea>
      </aside>
      <section id="simulator" aria-label="Zoetrope 模拟器" className="workbench-main">
        <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5">
          <h1 className="text-sm font-semibold">盘面工作区</h1>
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground"><span className="max-w-48 truncate">{multiRing ? `多圆环 · ${rings.filter((ring) => ring.enabled).length}/${rings.length} 圈启用` : materialName}</span><span>{multiRing ? `同步参考：${reference?.name ?? '无'}` : `${geometry.slots} 格 / ${geometry.frames} 帧 × ${geometry.repeats}`}</span></div>
        </div>
        <div className="workbench-preview">
            <div className="workspace-transport">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setPlaying((value) => !value)} className="min-w-24">{playing ? <Pause /> : <Play />}{playing ? '暂停' : '播放'}</Button>
                <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="上一采样帧" disabled={mode !== 'camera' || playing || frame.sample === 0} onClick={() => step(-1)}><StepBack /></Button></TooltipTrigger><TooltipContent>上一采样帧</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="下一采样帧" disabled={mode !== 'camera' || playing} onClick={() => step(1)}><StepForward /></Button></TooltipTrigger><TooltipContent>下一采样帧</TooltipContent></Tooltip>
                <Button variant="ghost" size="sm" onClick={reset}><RotateCcw />回到起点</Button>
              </div>
              <div role="group" aria-label="预览布局" className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
                {([
                  { value: 'both', label: '联合观察', icon: Columns2 },
                  { value: 'observation', label: '仅观察窗', icon: Scan },
                  { value: 'record', label: '仅盘片', icon: Disc3 },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <Button key={value} variant={layout === value ? 'secondary' : 'ghost'} size="sm" className={layout === value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'} aria-pressed={layout === value} onClick={() => setLayout(value)}><Icon />{label}</Button>
                ))}
              </div>
            </div>
            {multiRing && !reference && <p role="status" className="border-b bg-muted px-4 py-3 text-sm">没有启用圆环。请在多圆环编辑中启用至少一圈。</p>}
            {!multiRing && material.kind === 'example' && material.example === 'seam' && <p role="status" className="border-b bg-muted px-4 py-3 text-sm">接缝错误对照：最后一帧故意重复首帧。即使格距同步，仍会出现跳步和停顿。</p>}
            <SimulatorCanvas layout={layout} mode={mode} playing={playing} fps={fps} exposure={exposure} blur={blur} guides={guides} zoom={zoom} revision={revision} transport={transport} motion={motion} onFrame={onFrame} onRotate={rotateBy} material={material} geometry={geometry} rings={multiRing ? rings : undefined} observationTarget={observationTarget} />

        </div>
        <div className="workspace-status">
          <span role="status" className="flex shrink-0 items-center gap-1.5 text-xs"><span className={`size-1.5 rounded-full ${playing ? 'bg-primary' : 'bg-muted-foreground'}`} />{playing ? '正在播放' : '已暂停'}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{mode === 'camera' ? '相机采样' : '连续旋转'} · {drive === 'cd' ? 'CD · ' : ''}{displayRpm(liveRpm)} RPM · {Number(fps.toFixed(3))} fps · {(exposure * 1000).toFixed(2)} ms</span>
              <output data-testid="simulation-metrics" className="ml-auto text-xs text-muted-foreground tabular-nums">时间 {frame.time.toFixed(3)} s · 帧 {frame.sample} @ {frame.sampleTime.toFixed(3)} s · 角度 {((frame.angle * 180 / Math.PI % 360 + 360) % 360).toFixed(2)}° · 积分 {frame.exposureSamples} 次</output>
        </div>
      </section>
    </div>
  )
}
