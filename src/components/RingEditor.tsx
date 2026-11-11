import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

function RingDetail({ ring, fps, rpm, turns, variableSpeed, referenceId, observedId, update, onReference, onObserve, onMove, onDelete, canMoveUp, canMoveDown, canDelete }: {
  ring: RingLayer; fps: number; rpm: number; turns: number; variableSpeed: boolean; referenceId?: string; observedId?: string
  update: (ring: RingLayer) => void; onReference: (id: string) => void; onObserve: (id: string) => void
  onMove: (delta: number) => void; onDelete: () => void; canMoveUp: boolean; canMoveDown: boolean; canDelete: boolean
}) {
  const [tab, setTab] = useState('material')
  const [name, setName] = useState(ring.name)
  const { advance, label } = sampleMatch(turns, ring.geometry.slots, variableSpeed)
  const ownFps = matchedFps(rpm, ring.geometry.slots)
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 pb-3">
        <span className="text-xs text-muted-foreground">本圈设置</span>
        <Button size="sm" variant={observedId === ring.id ? 'secondary' : 'outline'} disabled={!ring.enabled} onClick={() => onObserve(ring.id)}>观察此圈</Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={`${ring.name}设置分组`} className="w-full"><TabsTrigger value="material">素材与循环</TabsTrigger><TabsTrigger value="placement">位置映射</TabsTrigger><TabsTrigger value="sampling">采样检查</TabsTrigger></TabsList>
        <TabsContent value="material" forceMount className="min-w-0 pt-3 data-[state=inactive]:hidden">
          <PlateEditor embedded idPrefix={`ring-${ring.id}`} material={ring.material} geometry={ring.geometry} onSelect={(material, geometry) => update({ ...ring, material, geometry: geometry ?? ring.geometry })} onGeometryChange={(geometry) => update({ ...ring, geometry })} />
        </TabsContent>
        <TabsContent value="placement" forceMount className="min-w-0 pt-3 data-[state=inactive]:hidden"><RingPlacement ring={ring} onApply={update} /></TabsContent>
        <TabsContent value="sampling" forceMount className="space-y-4 pt-3 data-[state=inactive]:hidden">
          <div><p className="text-sm font-medium">{!ring.enabled ? '本圈已隐藏' : '本圈' + label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">所有圆环共用转速与相机。这里检查本圈在当前设置下的结果。</p></div>
          <dl className="divide-y text-xs">
            {[
              ['共用转速', `${rpm.toFixed(2)} RPM`], ['当前相机', `${fps.toFixed(3)} fps`], ['每次采样前进', `${advance.toFixed(3)} 格`], ['本圈逐格所需采样率', `${ownFps.toFixed(3)} fps`], ['逐格匹配时动作周期', `${(ring.geometry.frames / ownFps).toFixed(3)} s`],
            ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="shrink-0 font-medium tabular-nums">{value}</dd></div>)}
          </dl>
          <div className="border-t pt-4"><p className="text-xs font-medium">同步参考圈</p><p className="mt-1 text-xs leading-5 text-muted-foreground">启用相机“自动匹配”时，用参考圈的格数计算采样率。其他圈仍按各自格数判断。</p><Button size="sm" className="mt-3" variant={referenceId === ring.id ? 'secondary' : 'outline'} disabled={!ring.enabled || referenceId === ring.id} onClick={() => onReference(ring.id)}>{referenceId === ring.id ? '本圈是当前参考圈' : '以本圈作为同步参考'}</Button></div>
        </TabsContent>
      </Tabs>
      <details className="mt-5 border-t py-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">管理此圈</summary>
        <div className="space-y-3 pt-4">
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) update({ ...ring, name: name.trim() }) }}><Label htmlFor={`${ring.id}-name`}>圆环名称</Label><div className="flex gap-2"><Input id={`${ring.id}-name`} maxLength={30} value={name} onChange={(event) => setName(event.target.value)} /><Button size="sm" type="submit" variant="outline" disabled={!name.trim() || name.trim() === ring.name}>重命名</Button></div></form>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-label={`上移${ring.name}`} disabled={!canMoveUp} onClick={() => onMove(-1)}>上移</Button><Button size="sm" variant="outline" aria-label={`下移${ring.name}`} disabled={!canMoveDown} onClick={() => onMove(1)}>下移</Button><Button size="sm" variant="ghost" className="text-destructive" aria-label={`删除${ring.name}`} disabled={!canDelete} onClick={onDelete}>删除此圈</Button></div>
          <p className="text-xs leading-5 text-muted-foreground">列表靠后的圈后绘制，重叠时覆盖前面的圈。至少保留一圈。</p>
        </div>
      </details>
    </div>
  )
}

export const RingEditor = memo(function RingEditor({ rings, fps, rpm, turns, variableSpeed, referenceId, observedId, onChange, onReference, onObserve }: Props) {
  const [expandedIds, setExpandedIds] = useState<string[]>([rings[0].id])
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
      <div aria-label="圆环卡片" className="space-y-3">
        {rings.map((ring, index) => {
          const expanded = expandedIds.includes(ring.id)
          const triggerId = `ring-card-${ring.id}-trigger`
          const bodyId = `ring-card-${ring.id}-body`
          return <section key={ring.id} aria-label={`${ring.name}圆环`} className="min-w-0 overflow-hidden rounded-lg border bg-card">
            <div className={`flex items-center gap-3 px-3 ${expanded ? 'bg-muted/50' : ''}`}>
              <button id={triggerId} type="button" aria-label={`${expanded ? '折叠' : '展开'}${ring.name}设置`} aria-expanded={expanded} aria-controls={bodyId} onClick={() => toggle(ring.id)} className="ring-card-trigger flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2"><span className={`truncate text-xs font-semibold ${ring.enabled ? '' : 'text-muted-foreground'}`}>{ring.name}</span>{referenceId === ring.id && <span className="text-[10px] text-primary">参考</span>}{observedId === ring.id && <span className="text-[10px] text-primary">观察</span>}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{ring.inner}–{ring.outer}% · {ring.geometry.slots} 格{!ring.enabled ? ' · 已隐藏' : ''}</span>
                </span>
                <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
              </button>
              <Switch aria-label={`启用${ring.name}`} checked={ring.enabled} onCheckedChange={(enabled) => update({ ...ring, enabled })} />
            </div>
            <div id={bodyId} hidden={!expanded} role="region" aria-labelledby={triggerId} className="border-t px-3 pt-3">
              <RingDetail turns={turns} variableSpeed={variableSpeed} ring={ring} fps={fps} rpm={rpm} referenceId={referenceId} observedId={observedId} update={update} onReference={onReference} onObserve={onObserve} onMove={(delta) => move(index, delta)} onDelete={() => onChange(rings.filter((item) => item.id !== ring.id))} canMoveUp={index > 0} canMoveDown={index < rings.length - 1} canDelete={rings.length > 1} />
            </div>
          </section>
        })}
      </div>
      <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">应用编辑会暂停并回到起点。展开、折叠和切换分组均保留图片与未应用草稿。</p>
    </section>
  )
})
