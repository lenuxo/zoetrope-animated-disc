import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CdRotation, cdConfigError } from '../simulation/cd'
import type { CdConfig } from '../simulation/cd'

const fields = [
  { key: 'startRadius', label: '起始半径（mm）', min: 25, max: 58, step: 1 },
  { key: 'endRadius', label: '结束半径（mm）', min: 25, max: 58, step: 1 },
  { key: 'duration', label: '扫描时长（s）', min: 1, max: 120, step: 1 },
  { key: 'velocity', label: '1× 线速度（m/s）', min: 1.2, max: 1.4, step: 0.01 },
  { key: 'acceleration', label: '加减速上限（RPM/s）', min: 10, max: 2000, step: 10 },
] as const

export function CdDriveEditor({ model, time, onApply }: { model: CdRotation; time: number; onApply: (config: CdConfig) => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(fields.map(({ key }) => [key, String(model.config[key])])) as Record<typeof fields[number]['key'], string>)
  const [control, setControl] = useState(model.config.control)
  const config = { ...Object.fromEntries(fields.map(({ key }) => [key, draft[key].trim() === '' ? NaN : Number(draft[key])])), control, ...(control === 'ideal' ? { acceleration: model.config.acceleration } : {}) } as CdConfig
  const error = cdConfigError(config)
  const changed = fields.some(({ key }) => config[key] !== model.config[key]) || control !== model.config.control
  const max = Math.max(Math.abs(model.targetRpmAt(0)), Math.abs(model.targetRpmAt(model.config.duration))) * 1.1
  const end = model.config.duration + (model.config.control === 'limited' ? Math.abs(model.targetRpmAt(0) - model.targetRpmAt(model.config.duration)) / model.config.acceleration : 0)
  const x = (seconds: number) => 30 + Math.min(1, seconds / end) * 210
  const y = (rpm: number) => 114 - Math.abs(rpm) / max * 90
  const curve = (target: boolean) => Array.from({ length: 121 }, (_, i) => {
    const t = end * i / 120
    return `${i ? 'L' : 'M'}${x(t)},${y(target ? model.targetRpmAt(t) : model.rpmAt(t))}`
  }).join(' ')
  return <div className="space-y-4">
    <p className="text-xs leading-5 text-muted-foreground">读取半径增大时，目标转速降低；扫描结束后保持终点半径。</p>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!error) onApply(config) }}>
      <div className="grid grid-cols-2 gap-3">{fields.filter(({ key }) => key !== 'acceleration' && key !== 'velocity').map(({ key, label, ...props }) => <div key={key} className="space-y-2"><Label htmlFor={`cd-${key}`}>{label}</Label><Input id={`cd-${key}`} type="number" {...props} value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} /></div>)}</div>
      <details className="inspector-disclosure"><summary>电机响应</summary><div className="space-y-4 pt-3">
        <div className="space-y-2"><Label htmlFor="cd-velocity">1× 线速度（m/s）</Label><Input id="cd-velocity" type="number" min={1.2} max={1.4} step={0.01} value={draft.velocity} onChange={event => setDraft(value => ({ ...value, velocity: event.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="cd-control">控制策略</Label><Select value={control} onValueChange={(value) => setControl(value as CdConfig['control'])}><SelectTrigger id="cd-control" aria-label="控制策略" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ideal">理想 CLV 跟随</SelectItem><SelectItem value="limited">限制电机加减速</SelectItem></SelectContent></Select></div>
      {control === 'limited' && <div className="space-y-2"><Label htmlFor="cd-acceleration">加减速上限（RPM/s）</Label><Input id="cd-acceleration" type="number" min={10} max={2000} step={10} value={draft.acceleration} onChange={(event) => setDraft((value) => ({ ...value, acceleration: event.target.value }))} /><p className="text-xs leading-5 text-muted-foreground">自定义电机响应模型；目标变化过快时，实际转速会滞后。</p></div>}
      </div></details>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={!!error || !changed}>应用并回到起点</Button>
      {changed && <span className="ml-2 text-xs text-muted-foreground">未应用修改</span>}
    </form>
    <details className="inspector-disclosure border-t pt-3"><summary>转速曲线与读数</summary><div className="pt-3"><div className="flex justify-end text-xs"><span className="text-muted-foreground">目标 ┄ · 实际 ━</span></div>
      <svg viewBox="0 0 250 142" role="img" aria-label="CD 目标与实际转速曲线" className="mt-2 w-full"><path d="M30 20V114H240" fill="none" stroke="currentColor" opacity="0.3" /><path d={curve(true)} fill="none" stroke="currentColor" strokeDasharray="4 3" opacity="0.6" /><path d={curve(false)} fill="none" stroke="var(--primary)" strokeWidth="2" /><line x1={x(time)} x2={x(time)} y1="20" y2="114" stroke="var(--primary)" opacity="0.35" /><circle cx={x(time)} cy={y(model.rpmAt(Math.min(time, end)))} r="3" fill="var(--primary)" /><g fill="currentColor" fontSize="9"><text x="0" y="16">RPM</text><text x="2" y="30">{Math.round(max)}</text><text x="17" y="117">0</text><text x="30" y="134">0 s</text><text x="240" y="134" textAnchor="end">{end.toFixed(1)} s</text></g></svg>
      <dl className="space-y-2 text-xs tabular-nums">{[['读取半径', `${model.radiusAt(time).toFixed(2)} mm`], ['目标转速', `${Math.abs(model.targetRpmAt(time)).toFixed(2)} RPM`], ['实际转速', `${Math.abs(model.rpmAt(time)).toFixed(2)} RPM`], ['实际线速度', `${(Math.abs(model.rpmAt(time)) * 2 * Math.PI * model.radiusAt(time) / 60000).toFixed(3)} m/s`]].map(([label, value]) => <div key={label} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl>
    </div></details>
  </div>
}
