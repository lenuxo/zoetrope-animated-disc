import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

export type ObservationSize = { width: number; height: number }
const PRESETS = [
  { label: '纵向', ratio: '1:2', width: 0.06 },
  { label: '聚焦', ratio: '1:1', width: 0.12 },
  { label: '标准', ratio: '2:1', width: 0.24 },
  { label: '宽幅', ratio: '3:1', width: 0.36 },
]

/** Symmetric resizing keeps the same physical point at the center of the crop. */
export function ObservationWindow({ centerY, size, onChange, radius, onRadiusChange }: { radius: number; onRadiusChange: (value: number) => void; centerY: number; size: ObservationSize; onChange: (size: ObservationSize) => void }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; size: ObservationSize; scale: number; radius: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const clamp = (next: ObservationSize) => ({ width: Math.max(0.04, Math.min(0.9, next.width)), height: Math.max(0.04, Math.min(2 * Math.min(centerY, 1 - centerY), next.height)) })
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = frameRef.current!.parentElement!.getBoundingClientRect()
    drag.current = { x: event.clientX, y: event.clientY, size, scale: bounds.width, radius }
    setResizing(true)
  }
  return <div ref={frameRef} data-testid="observation-window" className={`observation-window ${resizing ? 'is-resizing' : ''}`} style={{ left: `${(0.5 - size.width / 2) * 100}%`, top: `${(centerY - size.height / 2) * 100}%`, width: `${size.width * 100}%`, height: `${size.height * 100}%` }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button type="button" className="observation-move" aria-label="沿半径移动观察窗" onPointerDown={start} onPointerMove={(event) => {
      const current = drag.current
      if (current) onRadiusChange(current.radius - (event.clientY - current.y) / current.scale * (600 / 292) * 100)
    }} onLostPointerCapture={() => { drag.current = null; setResizing(false) }} onKeyDown={(event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        onRadiusChange(radius + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 5 : 1))
      }
    }} />
    {['left', 'right', 'top', 'bottom', 'corner'].map((edge) => <button key={edge} type="button" className={`observation-handle observation-handle-${edge}`} aria-label={edge === 'corner' ? '调整观察视野宽高' : `调整观察视野${edge === 'left' || edge === 'right' ? '宽度' : '高度'}（${{ left: '左', right: '右', top: '上', bottom: '下' }[edge]}边）`} onPointerDown={start} onPointerMove={(event) => {
      const current = drag.current
      if (!current) return
      event.stopPropagation()
      onChange(clamp({ width: current.size.width + (edge === 'left' ? -2 : edge === 'right' || edge === 'corner' ? 2 : 0) * (event.clientX - current.x) / current.scale, height: current.size.height + (edge === 'top' ? -2 : edge === 'bottom' || edge === 'corner' ? 2 : 0) * (event.clientY - current.y) / current.scale }))
    }} onPointerUp={(event) => { event.stopPropagation(); drag.current = null; setResizing(false) }} onPointerCancel={() => { drag.current = null; setResizing(false) }} onLostPointerCapture={() => { drag.current = null; setResizing(false) }} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      const delta = event.shiftKey ? 0.02 : 0.005
      onChange(clamp({ width: size.width + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0), height: size.height + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0) }))
    }} />)}
    <div className="observation-presets" role="group" aria-label="观察窗比例预设">
      <span className="observation-presets-title">取景比例 · 拖拽边框自由调整</span>
      <div className="observation-preset-options">{PRESETS.map((preset) => <button key={preset.ratio} type="button" aria-pressed={Math.abs(size.width / size.height - preset.width / 0.12) < 0.01} onClick={() => {
        const height = Math.min(0.12, 2 * Math.min(centerY, 1 - centerY))
        onChange({ width: preset.width * height / 0.12, height })
      }}>{preset.ratio}<span>{preset.label}</span></button>)}</div>
    </div>
  </div>
}
