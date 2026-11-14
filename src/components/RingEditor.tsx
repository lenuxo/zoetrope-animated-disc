import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PlateEditor } from './PlateEditor'
import { ringError } from '../simulation/rings'
import type { RingLayer } from '../simulation/rings'
import { matchedFps, sampleMatch } from '../simulation/model'

type Props = {
  rings: RingLayer[]
  fps: number
  rpm: number
  turns: number
  variableSpeed: boolean
  referenceId?: string
  observedId?: string
  onChange: (rings: RingLayer[]) => void
  onReference: (id: string) => void
  onObserve: (id: string) => void
}
const rangeFields = ['inner', 'outer', 'sourceInner', 'sourceOuter', 'phase'] as const

function RingPlacement({ ring, onApply }: { ring: RingLayer; onApply: (ring: RingLayer) => void }) {
  const initial = () => Object.fromEntries(rangeFields.map((key) => [key, String(ring[key])])) as Record<typeof rangeFields[number], string>
  const [draft, setDraft] = useState(initial)
  const proposed = { ...ring, ...Object.fromEntries(rangeFields.map((key) => [key, draft[key].trim() === '' ? NaN : Number(draft[key])])) } as RingLayer
  const error = ringError(proposed)
  const changed = rangeFields.some((key) => proposed[key] !== ring[key])
  const range = (title: string, description: string, inner: 'inner' | 'sourceInner', outer: 'outer' | 'sourceOuter') => {
    const valid = Number.isFinite(proposed[inner]) && Number.isFinite(proposed[outer]) && proposed[inner] >= 0 && proposed[outer] <= 100 && proposed[outer] > proposed[inner]
    return <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-xs font-semibold">{title}</legend>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="grid grid-cols-2 gap-3">
        {([inner, outer] as const).map((key, index) => <div key={key} className="space-y-2"><Label htmlFor={`${ring.id}-${key}`}>{index === 0 ? '内缘（%）' : '外缘（%）'}</Label><Input id={`${ring.id}-${key}`} type="number" step="any" aria-label={`${title}${index === 0 ? '内缘' : '外缘'}`} value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
      </div>
      <div aria-hidden="true" className="relative h-2 overflow-hidden rounded-full bg-muted">{valid && <div className="absolute inset-y-0 rounded-full bg-primary/70" style={{ left: `${proposed[inner]}%`, width: `${proposed[outer] - proposed[inner]}%` }} />}</div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>圆心 0%</span><span>盘片外缘 100%</span></div>
    </fieldset>
  }
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!error) onApply(proposed) }}>
      {range('源图范围', '从本圈素材中取出哪一段圆环。', 'sourceInner', 'sourceOuter')}
      <div className="border-t pt-4">{range('盘面位置', '把取出的圆环放到最终唱片的哪个位置。', 'inner', 'outer')}</div>
      <div className="space-y-2 border-t pt-4"><Label htmlFor={`${ring.id}-phase`}>相位偏移（°）</Label><Input id={`${ring.id}-phase`} type="number" min="-360" max="360" step="any" value={draft.phase} onChange={(event) => setDraft((value) => ({ ...value, phase: event.target.value }))} /><p className="text-xs leading-5 text-muted-foreground">只转动这圈的初始朝向，播放时仍跟随整张唱片。</p></div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={!!error || !changed}>应用位置</Button><Button type="button" variant="ghost" size="sm" disabled={!changed} onClick={() => setDraft(initial())}>撤销修改</Button><span role="status" className="text-xs text-muted-foreground">{changed ? '有未应用修改' : '位置已应用'}</span></div>
    </form>
  )
}

function RingDetail({ ring, fps, rpm, turns, variableSpeed, expanded, onExpand, update, onMove, onDelete, canMoveUp, canMoveDown, canDelete }: {
  ring: RingLayer; fps: number; rpm: number; turns: number; variableSpeed: boolean; expanded: boolean; onExpand: () => void
  update: (ring: RingLayer) => void
  onMove: (delta: number) => void; onDelete: () => void; canMoveUp: boolean; canMoveDown: boolean; canDelete: boolean
}) {
  const [name, setName] = useState(ring.name)
  const { advance, label } = sampleMatch(turns, ring.geometry.slots, variableSpeed)
  const ownFps = matchedFps(rpm, ring.geometry.slots)
  return <div className="ring-detail">
    <PlateEditor embedded advanced={expanded} idPrefix={`ring-${ring.id}`} material={ring.material} geometry={ring.geometry}
      onSelect={(material, geometry) => { update({ ...ring, material, geometry: geometry ?? ring.geometry }); if (material.kind === 'image' && !expanded) onExpand() }}
      onGeometryChange={(geometry) => update({ ...ring, geometry })} />
    <div id={`ring-${ring.id}-details`} hidden={!expanded} className="ring-advanced">
      <section aria-label={`${ring.name}位置映射`} className="ring-detail-section"><h4>位置映射</h4><RingPlacement ring={ring} onApply={update} /></section>
      <section aria-label={`${ring.name}采样检查`} className="ring-detail-section">
        <h4>采样检查</h4><p className="text-xs">{!ring.enabled ? '本圈已隐藏' : '本圈' + label}</p>
        <dl className="divide-y text-xs">
          {[
            ['共用转速', `${rpm.toFixed(2)} RPM`], ['当前相机', `${fps.toFixed(3)} fps`], ['每次采样前进', `${advance.toFixed(3)} 格`], ['本圈逐格所需采样率', `${ownFps.toFixed(3)} fps`], ['逐格匹配时动作周期', `${(ring.geometry.frames / ownFps).toFixed(3)} s`],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="shrink-0 tabular-nums">{value}</dd></div>)}
        </dl>
      </section>
      <details className="mt-5 border-t py-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">管理此圈</summary>
        <div className="space-y-3 pt-4">
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) update({ ...ring, name: name.trim() }) }}><Label htmlFor={`${ring.id}-name`}>圆环名称</Label><div className="flex gap-2"><Input id={`${ring.id}-name`} maxLength={30} value={name} onChange={(event) => setName(event.target.value)} /><Button size="sm" type="submit" variant="outline" disabled={!name.trim() || name.trim() === ring.name}>重命名</Button></div></form>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-label={`上移${ring.name}`} disabled={!canMoveUp} onClick={() => onMove(-1)}>上移</Button><Button size="sm" variant="outline" aria-label={`下移${ring.name}`} disabled={!canMoveDown} onClick={() => onMove(1)}>下移</Button><Button size="sm" variant="ghost" className="text-destructive" aria-label={`删除${ring.name}`} disabled={!canDelete} onClick={onDelete}>删除此圈</Button></div>
          <p className="text-xs leading-5 text-muted-foreground">列表靠后的圈后绘制，重叠时覆盖前面的圈。至少保留一圈。</p>
        </div>
      </details>
    </div>
  </div>
}

export const RingEditor = memo(function RingEditor({ rings, fps, rpm, turns, variableSpeed, referenceId, observedId, onChange, onReference, onObserve }: Props) {
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const toggle = (id: string) => setExpandedIds((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
  const update = (next: RingLayer) => onChange(rings.map((ring) => ring.id === next.id ? next : ring))
  const move = (index: number, delta: number) => {
    const next = [...rings]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange(next)
  }
  const add = () => {
    const base = rings.find((ring) => ring.id === referenceId) ?? rings[0]
    const id = crypto.randomUUID()
    onChange([...rings, { id, name: `圆环 ${rings.length + 1}`, enabled: true, material: { kind: 'example', example: 'bounce' }, geometry: { ...base.geometry }, inner: 50, outer: 70, sourceInner: 60, sourceOuter: 94, phase: 0 }])
    setExpandedIds((value) => [...value, id])
  }
  return (
    <section aria-labelledby="rings-title" className="rings-editor min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-2 py-3"><h3 id="rings-title" className="ring-title text-sm font-semibold">圆环图层</h3><Button variant="outline" size="sm" disabled={rings.length >= 4} onClick={add}>添加圆环 · {rings.length}/4</Button></header>
      <div aria-label="圆环列表" className="ring-list">
        {rings.map((ring, index) => {
          const expanded = expandedIds.includes(ring.id)
          const bodyId = `ring-${ring.id}-details`
          return <section key={ring.id} aria-label={`${ring.name}圆环`} className="ring-row">
            <header className="ring-row-heading">
              <div className="min-w-0"><div className="flex items-center gap-2"><h4>{ring.name}</h4>{referenceId === ring.id && <span className="ring-badge">参考</span>}{observedId === ring.id && <span className="ring-badge">观察</span>}</div>
                <p>{ring.inner}–{ring.outer}% · {ring.geometry.slots} 格{!ring.enabled ? ' · 已隐藏' : ''}</p>
              </div>
              <Switch aria-label={`启用${ring.name}`} checked={ring.enabled} onCheckedChange={(enabled) => update({ ...ring, enabled })} />
            </header>
            <div className="ring-quick-actions">
              <Button size="sm" variant={observedId === ring.id ? 'secondary' : 'outline'} disabled={!ring.enabled} onClick={() => onObserve(ring.id)}>观察此圈</Button>
              {referenceId !== ring.id && <Button size="sm" variant="ghost" disabled={!ring.enabled} onClick={() => onReference(ring.id)}>设为参考</Button>}
              <Button size="sm" variant="ghost" aria-label={`${expanded ? '折叠' : '展开'}${ring.name}设置`} aria-expanded={expanded} aria-controls={`${bodyId} ring-${ring.id}-editor-geometry${ring.material.kind === 'image' ? ` ring-${ring.id}-editor-calibration` : ''}`} onClick={() => toggle(ring.id)}>详细配置<ChevronDown className={`size-3.5 ${expanded ? 'rotate-180' : ''}`} /></Button>
            </div>
            <div>
              <RingDetail turns={turns} variableSpeed={variableSpeed} ring={ring} fps={fps} rpm={rpm} expanded={expanded} onExpand={() => toggle(ring.id)} update={update} onMove={(delta) => move(index, delta)} onDelete={() => onChange(rings.filter((item) => item.id !== ring.id))} canMoveUp={index > 0} canMoveDown={index < rings.length - 1} canDelete={rings.length > 1} />
            </div>
          </section>
        })}
      </div>
      <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">应用编辑会暂停并复位；折叠保留未应用的草稿。</p>
    </section>
  )
})
