import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createPlate, renderExposure } from '@/simulation/render'
import { RotationTimeline, sourceFrameAtSlot } from '@/simulation/model'
import { diagnosticPose } from '@/simulation/plate'
import type { PlateGeometry } from '@/simulation/plate'

/** Only deliberate playback; leaving the demo or hiding the tab stops its clock. */
function useDemoClock() {
  const root = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onPreference = () => { setReduced(media.matches); if (media.matches) setPlaying(false) }
    const onVisibility = () => { if (document.hidden) setPlaying(false) }
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setPlaying(false) })
    if (root.current) observer.observe(root.current)
    media.addEventListener('change', onPreference)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); media.removeEventListener('change', onPreference); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  useEffect(() => {
    if (!playing || reduced) return
    const timer = { previous: performance.now(), request: 0 }
    const tick = (now: number) => {
      const elapsed = now - timer.previous
      if (elapsed >= 1000 / 60) {
        setTime((value) => value + Math.min(elapsed / 1000, 0.1))
        timer.previous = now
      }
      timer.request = requestAnimationFrame(tick)
    }
    timer.request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timer.request)
  }, [playing, reduced])
  return { root, clock: { time, setTime, playing, setPlaying, reduced } }
}

type DemoClock = ReturnType<typeof useDemoClock>['clock']
function Playback({ clock, step, label = '播放演示' }: { clock: DemoClock; step: number; label?: string }) {
  return <div className="guide-demo-transport">
    <Button size="sm" disabled={clock.reduced} onClick={() => clock.setPlaying(!clock.playing)}>{clock.playing ? <Pause /> : <Play />}{clock.playing ? '暂停演示' : label}</Button>
    <Button size="sm" variant="outline" onClick={() => { clock.setPlaying(false); clock.setTime((value) => (Math.floor(value / step + 1e-6) + 1) * step) }}><StepForward />下一帧</Button>
    <Button size="sm" variant="ghost" onClick={() => { clock.setPlaying(false); clock.setTime(0) }}><RotateCcw />重置</Button>
    {clock.reduced && <span className="guide-caption">已跟随减少动态效果设置，请逐帧查看。</span>}
  </div>
}

export function SamplingDemo({ geometry, rpm }: { geometry: PlateGeometry; rpm: number }) {
  const { root, clock } = useDemoClock()
  const [fps, setFps] = useState(30)
  const [shutter, setShutter] = useState(0.001)
  const disc = useRef<HTMLCanvasElement>(null)
  const lens = useRef<HTMLCanvasElement>(null)
  const buffers = useRef<{ plate: HTMLCanvasElement; sampled: HTMLCanvasElement; motion: RotationTimeline; geometry: PlateGeometry; rpm: number } | null>(null)
  const sample = Math.floor(clock.time * fps + 1e-6)
  useEffect(() => {
    if (!buffers.current || buffers.current.geometry !== geometry || buffers.current.rpm !== rpm) {
      const sampled = buffers.current?.sampled ?? document.createElement('canvas')
      if (!buffers.current) sampled.width = sampled.height = 600
      buffers.current = { plate: createPlate({ kind: 'example', example: 'bounce' }, geometry), sampled, motion: new RotationTimeline(rpm), geometry, rpm }
    }
    const { plate, sampled, motion } = buffers.current
    renderExposure(disc.current!.getContext('2d')!, plate, motion, clock.time, 0)
    // Start a full turn into the timeline so even the initial still has a full shutter interval.
    renderExposure(sampled.getContext('2d')!, plate, motion, 60 / rpm + sample / fps, shutter)
    const ctx = lens.current!.getContext('2d')!
    ctx.clearRect(0, 0, 360, 360)
    ctx.drawImage(sampled, 600 * 0.46, 600 * 0.065, 600 * 0.08, 600 * 0.12, 60, 0, 240, 360)
  }, [clock.time, sample, fps, shutter, geometry, rpm])
  return <div className="guide-demo" ref={root}>
    <div className="guide-demo-heading"><h3>亲手试试：同步与清晰，是两件事</h3><span>{geometry.slots} 格 · {geometry.frames} 帧 × {geometry.repeats} · {rpm === 45 ? '45' : '33⅓'} RPM</span></div>
    <div key={`${geometry.slots}-${geometry.frames}-${fps}-${shutter}`} className="guide-sampling-views guide-state-enter">
      <figure><figcaption>整张静态盘面在旋转</figcaption><div className="guide-disc-view"><canvas ref={disc} width="480" height="480" role="img" aria-label="连续旋转的静态弹跳盘面" /><span className="guide-demo-window" /></div></figure>
      <figure><figcaption>相机在固定位置采样</figcaption><div className="guide-lens-view"><canvas ref={lens} width="360" height="360" role="img" aria-label="从同一盘面采样并累积曝光的放大观察窗" /></div></figure>
    </div>
    <div className="guide-demo-controls">
      <div className="guide-control-field"><Label htmlFor="demo-fps">采样频率</Label><Select value={String(fps)} onValueChange={(value) => { setFps(Number(value)); clock.setTime(0) }}><SelectTrigger id="demo-fps" aria-label="演示采样频率" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 fps · 精确同步</SelectItem><SelectItem value="30.6">30.6 fps · 偏快 2%</SelectItem><SelectItem value="29.4">29.4 fps · 偏慢 2%</SelectItem></SelectContent></Select></div>
      <div className="guide-control-field"><Label htmlFor="demo-shutter">曝光时间</Label><Select value={String(shutter)} onValueChange={(value) => setShutter(Number(value))}><SelectTrigger id="demo-shutter" aria-label="演示曝光时间" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0.001">1/1000 秒 · 短曝光</SelectItem><SelectItem value="0.008333333333333333">1/120 秒</SelectItem><SelectItem value="0.016666666666666666">1/60 秒 · 长曝光</SelectItem></SelectContent></Select></div>
    </div>
    <Playback clock={clock} step={1 / fps} />
    <div className="guide-demo-reading"><strong>{fps === 30 ? '格距同步' : '格距失配'} · 每次前进 {(30 / fps).toFixed(3)} 格</strong><span>曝光覆盖 {(30 * shutter).toFixed(2)} 格距 · 采样帧 {sample}</span></div>
    <p className="guide-caption">先播放，再比较 30 与 30.6 fps；恢复 30 fps 后延长曝光，看位置保持同步但出现拖影。两幅画面由同一静态盘面计算。盘面帧数与重复次数跟随「参数试算」，不单独播放角色。</p>
  </div>
}

function Pose({ frame, frames = 12 }: { frame: number; frames?: number }) {
  return <svg viewBox="0 0 120 120" role="img" aria-label={`动作姿态 ${frame + 1}`}>
    <circle cx="60" cy="60" r="42" fill="none" stroke="var(--border)" strokeWidth="2" />
    <g transform={`rotate(${frame / frames * 360} 60 60)`}>
      <path d="M60 76 V24 M52 34 L60 24 L68 34" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g><circle cx="60" cy="60" r="5" fill="var(--primary)" />
  </svg>
}

export function LoopDemo() {
  const { root, clock } = useDemoClock()
  const [broken, setBroken] = useState(false)
  const index = Math.floor(clock.time * 6 + 1e-6) % 12
  const pose = diagnosticPose(index, 12, broken)
  return <div className="guide-demo" ref={root}>
    <div className="guide-demo-heading"><h3>接缝实验：末帧复制首帧，会发生什么？</h3><span>12 帧 · 教学慢放 6 fps</span></div>
    <div role="group" aria-label="循环接缝方案" className="guide-demo-options"><Button size="sm" variant={!broken ? 'default' : 'secondary'} aria-pressed={!broken} onClick={() => setBroken(false)}>连续循环</Button><Button size="sm" variant={broken ? 'default' : 'secondary'} aria-pressed={broken} onClick={() => setBroken(true)}>末帧复制首帧</Button></div>
    <div className="guide-loop-preview"><Pose key={pose.index} frame={pose.index} /><div><span className="guide-caption">当前位置 {String(index + 1).padStart(2, '0')} / 12</span><p><strong>显示姿态 {String(pose.ordinal).padStart(2, '0')}</strong></p><p>{broken ? '11 → 01 → 01：接缝前跳过姿态 12，再连续显示两次 01。' : '11 → 12 → 01：每次前进相同角度，接缝也保持节奏。'}</p></div></div>
    <div className="guide-frame-strip" role="group" aria-label="选择源动画帧">{Array.from({ length: 12 }, (_, i) => <button key={i} aria-label={`查看第 ${i + 1} 帧`} aria-pressed={index === i} onClick={() => { clock.setPlaying(false); clock.setTime(i / 6) }}><Pose frame={diagnosticPose(i, 12, broken).index} /><span>{String(i + 1).padStart(2, '0')}</span></button>)}</div>
    <div className="guide-demo-scrub"><Label htmlFor="demo-loop-frame">拖动逐帧检查</Label><Slider id="demo-loop-frame" aria-label="循环动画帧" min={0} max={11} step={1} value={[index]} onValueChange={([value]) => { clock.setPlaying(false); clock.setTime(value / 6) }} className="min-w-24 flex-1" /></div>
    <Playback clock={clock} step={1 / 6} label="慢放循环" />
    <p className="guide-caption">点击任意缩略帧，或拖动滑杆。选择第 11 帧后连续点击「下一帧」，对比接缝处的姿态变化。</p>
  </div>
}

export function LayoutDemo() {
  const { root, clock } = useDemoClock()
  const [direction, setDirection] = useState(1)
  const [reversed, setReversed] = useState(false)
  const [local, setLocal] = useState(true)
  const step = Math.floor(clock.time * 4 + 1e-6)
  const angle = step * 30 * direction
  const continuousAngle = (clock.playing ? clock.time * 4 : step) * 30 * direction
  const slot = ((-step * direction % 12) + 12) % 12
  const frame = sourceFrameAtSlot(reversed ? -slot : slot, 6)
  return <div className="guide-demo" ref={root}>
    <div className="guide-demo-heading"><h3>排布实验：谁会接替观察窗里的这一帧？</h3><span>12 格 = 6 帧 × 2 · 教学慢放</span></div>
    <div className="guide-layout-lab">
      <svg viewBox="0 0 320 300" role="img" aria-label={`盘面${direction === 1 ? '顺' : '逆'}时针前进 ${step} 格，顶部为姿态 ${frame + 1}`}>
        <circle cx="160" cy="150" r="118" fill="var(--muted)" stroke="var(--border)" />
        <g key={`${direction}-${reversed}`} className="guide-rotating-layout guide-state-enter" style={{ transform: `rotate(${continuousAngle}deg)`, transformOrigin: '160px 150px', transitionDuration: clock.playing || clock.time === 0 ? '0ms' : undefined }}>{Array.from({ length: 12 }, (_, i) => {
          const source = sourceFrameAtSlot(reversed ? -i : i, 6)
          return <g key={i} transform={`translate(160 150) rotate(${i * 30}) translate(0 -88)`}><g className="guide-local-orientation" style={{ transform: `rotate(${local ? 0 : -i * 30}deg)` }}>
            <rect x="-18" y="-21" width="36" height="42" rx="4" fill={slot === i ? 'var(--primary)' : 'var(--card)'} stroke="var(--border)" />
            <path d="M-4 -13 L0 -17 L4 -13" fill="none" stroke={slot === i ? 'var(--primary-foreground)' : 'var(--muted-foreground)'} />
            <text x="0" y="9" textAnchor="middle" fontSize="17" fontWeight="600" fill={slot === i ? 'var(--primary-foreground)' : 'var(--foreground)'}>{source + 1}</text>
          </g></g>
        })}</g>
        <circle cx="160" cy="150" r="5" fill="var(--primary)" />
        <text x="160" y="144" dy="-12" textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">{direction === 1 ? '顺时针' : '逆时针'}</text>
        <text x="160" y="185" textAnchor="middle" fontSize="34" fill="var(--primary)" aria-hidden="true">{direction === 1 ? '↻' : '↺'}</text>
        <rect x="137" y="35" width="46" height="54" rx="6" fill="none" stroke="var(--primary)" strokeWidth="2" />
        <text x="160" y="20" textAnchor="middle" fontSize="12" fill="var(--primary)">固定观察窗</text>
        <text x="160" y="292" textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">盘面连续旋转，观察窗每格采样一次</text>
      </svg>
      <div className="guide-layout-result"><span className="guide-caption">观察窗中的图案</span><div className="guide-observed-glyph" style={{ transform: `rotate(${local ? 0 : angle}deg)` }}><span>↑</span><strong key={frame} className="guide-state-enter">{frame + 1}</strong></div><p>姿态序列：{direction * (reversed ? -1 : 1) === 1 ? '1 → 2 → 3 → 4 → 5 → 6' : '1 → 6 → 5 → 4 → 3 → 2'}</p><p className="guide-caption">{local ? '每帧跟随圆周朝向，转到顶部时保持直立。' : '每帧在静态图上都朝页面上方，旋转后观察窗里的朝向不断改变。'}</p></div>
    </div>
    <div className="guide-demo-controls"><div className="guide-control-field"><Label htmlFor="demo-direction">唱片旋转方向</Label><Select value={String(direction)} onValueChange={(value) => { setDirection(Number(value)); clock.setTime(0) }}><SelectTrigger id="demo-direction" aria-label="排布演示旋转方向" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">顺时针</SelectItem><SelectItem value="-1">逆时针</SelectItem></SelectContent></Select></div><div className="guide-control-field"><Label htmlFor="demo-frame-order">沿圆周的帧序</Label><Select value={String(reversed)} onValueChange={(value) => { setReversed(value === 'true'); clock.setTime(0) }}><SelectTrigger id="demo-frame-order" aria-label="排布演示帧序" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">逆时针递增</SelectItem><SelectItem value="true">顺时针递增</SelectItem></SelectContent></Select></div></div>
    <label className="guide-demo-check"><input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />每帧的顶部朝圆外</label>
    <Playback clock={clock} step={0.25} label="逐格慢放" />
    <p className="guide-caption">试着只反转唱片，观察编号倒序；再反转帧序，恢复正向动作。取消「顶部朝圆外」，检查位置对齐后为什么仍会转头。盘面转动带有过渡，观察窗保留离散采样。</p>
  </div>
}

/** Diagram uses the same frame-at-slot convention as the baked workbench plate. */
export function ParameterPreview({ slots, frames, repeats, rpm }: PlateGeometry & { rpm: number }) {
  const { root, clock } = useDemoClock()
  const sample = Math.floor(clock.time * 30 + 1e-6)
  const frame = sample % frames
  const angle = clock.time * rpm * 6
  const sampleAngle = sample * 360 / slots
  const period = frames / 30
  const bounce = (1 - Math.cos(frame / frames * Math.PI * 2)) / 2
  const circumference = 2 * Math.PI * 119
  return <div className="guide-parameter-preview" ref={root}>
    <div className="guide-demo-heading"><h3>参数一改，排布与节奏一起变</h3><span>30 fps · 实时速度</span></div>
    <div className="guide-parameter-views">
      <figure>
        <figcaption>圆周上有 {repeats} 组完整动作</figcaption>
        <svg viewBox="0 0 300 300" role="img" aria-label={`${slots} 个位置，每 ${frames} 帧重复一次，共 ${repeats} 组`}>
          <circle cx="150" cy="150" r="124" fill="var(--muted)" />
          <g style={{ transform: `rotate(${clock.playing ? angle : sampleAngle}deg)`, transformOrigin: '150px 150px', transitionDuration: clock.playing || clock.time === 0 ? '0ms' : undefined }} className="guide-rotating-layout">
            {Array.from({ length: repeats }, (_, group) => <circle key={group} className="guide-repeat-arc" cx="150" cy="150" r="119" fill="none" stroke={group % 2 ? 'var(--muted-foreground)' : 'var(--primary)'} strokeWidth="5" strokeDasharray={`${circumference / repeats - 2} ${circumference - circumference / repeats + 2}`} strokeDashoffset={-group * circumference / repeats} transform="rotate(-90 150 150)" />)}
            <g transform="translate(150 150)">{Array.from({ length: slots }, (_, slot) => {
              const source = sourceFrameAtSlot(slot, frames)
              const lift = (1 - Math.cos(source / frames * Math.PI * 2)) / 2
              return <g key={slot} className="guide-parameter-slot" style={{ transform: `rotate(${slot * 360 / slots}deg)` }}>
                <path d="M-2 -82 H2" stroke="var(--muted-foreground)" />
                <ellipse className="guide-parameter-dot" cx="0" cy={-88 - lift * 21} rx={Math.min(4.5, 160 / slots)} ry={3 + lift * 2} fill={source === 0 ? 'var(--foreground)' : 'var(--primary)'} />
              </g>
            })}</g>
          </g>
          <circle cx="150" cy="150" r="53" fill="var(--card)" stroke="var(--border)" />
          <text x="150" y="145" textAnchor="middle" fontSize="23" fontWeight="600" fill="var(--foreground)">{slots} 格</text>
          <text x="150" y="165" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{frames} 帧 × {repeats} 次</text>
          <rect x="143" y="35" width="14" height="34" rx="3" fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
          <text x="150" y="16" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">固定观察位置</text>
          <text x="150" y="290" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">外沿每一段标记，代表一组循环</text>
        </svg>
      </figure>
      <figure>
        <figcaption>取样后的弹跳 · 每 {Number(period.toFixed(3))} 秒重复</figcaption>
        <svg viewBox="0 0 300 300" role="img" aria-label={`当前第 ${frame + 1} 帧，共 ${frames} 帧，动作周期 ${Number(period.toFixed(3))} 秒`}>
          <rect x="38" y="28" width="224" height="224" rx="12" fill="var(--muted)" />
          <path d="M88 212 H212" stroke="var(--border)" strokeWidth="2" />
          <ellipse cx="150" cy="212" rx={21 - bounce * 9} ry="4" fill="var(--foreground)" opacity={0.15 - bounce * 0.08} />
          <ellipse cx="150" cy={196 - bounce * 110} rx={17 - bounce * 5} ry={11 + bounce * 8} fill="var(--primary)" />
          <text x="150" y="238" textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">姿态 {frame + 1} / {frames}</text>
          <circle cx="150" cy="275" r="10" fill="none" stroke="var(--border)" strokeWidth="2" />
          <g style={{ transform: `rotate(${clock.time / period * 360}deg)`, transformOrigin: '150px 275px' }}><circle cx="150" cy="265" r="3" fill="var(--primary)" /></g>
          <text x="170" y="279" fontSize="11" fill="var(--muted-foreground)">一圈 = 一个动作周期</text>
        </svg>
      </figure>
    </div>
    <Playback clock={clock} step={1 / 30} label="播放联动预览" />
    <div className="guide-cycle-strip" role="img" aria-label={`一个循环包含 ${frames} 帧，当前姿态为 ${frame + 1}`}>
      {Array.from({ length: frames }, (_, index) => <span key={index} className={index === frame ? 'is-current' : ''} />)}
    </div>
    <p className="guide-caption">同一转速下，选择更多独立帧会拉长动作周期，选择更多重复组会加快循环。调整参数时可继续播放；圆周姿态的重新排布带有过渡，观察窗按真实的 30 fps 更新。</p>
  </div>
}
