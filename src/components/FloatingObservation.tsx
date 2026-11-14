import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Camera, ChevronDown, SlidersHorizontal, X } from 'lucide-react'

type Position = { x: number; y: number }

export function FloatingObservation({ children, settings }: { children: ReactNode; settings: ReactNode }) {
  const windowRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; origin: Position } | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [visible, setVisible] = useState(true)
  const restoreRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  function move(next: Position) {
    const element = windowRef.current
    const parent = element?.offsetParent as HTMLElement | null
    if (!element || !parent) return
    const x = Math.max(12, Math.min(next.x, parent.clientWidth - element.offsetWidth - 12))
    const y = Math.max(12, Math.min(next.y, parent.clientHeight - element.offsetHeight - 68))
    setPosition(previous => previous?.x === x && previous.y === y ? previous : { x, y })
  }

  useEffect(() => {
    const element = windowRef.current!
    const parent = element.offsetParent as HTMLElement
    const observer = new ResizeObserver(() => move({ x: element.offsetLeft, y: element.offsetTop }))
    observer.observe(element)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  return <>
    {!visible && <Button ref={restoreRef} className="camera-window-restore" variant="ghost" size="icon" aria-label="显示相机视野" title="显示相机视野" onClick={() => {
      setVisible(true)
      requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    }}><Camera /></Button>}
    <div ref={windowRef} className="spatial-monitor instrument-controls" hidden={!visible} data-settings-open={settingsOpen} data-dragging={dragging}
    style={position ? { left: position.x, top: position.y } : undefined}>
    <div ref={titleRef} className="spatial-monitor-heading" role="toolbar" aria-label="相机视野窗口，可拖动或使用方向键移动" tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as Element).closest('button')) return
        const element = windowRef.current!
        drag.current = { x: event.clientX, y: event.clientY, origin: { x: element.offsetLeft, y: element.offsetTop } }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
        event.preventDefault()
      }}
      onPointerMove={event => {
        const start = drag.current
        if (start) move({ x: start.origin.x + event.clientX - start.x, y: start.origin.y + event.clientY - start.y })
      }}
      onPointerUp={() => { drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false) }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const element = windowRef.current!
        const step = event.shiftKey ? 40 : 10
        move({ x: element.offsetLeft + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
          y: element.offsetTop + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) })
      }}>
      <span>相机视野</span>
      <div className="camera-window-actions">
        <Button variant="ghost" size="icon" aria-label="隐藏相机视野" title="隐藏相机视野" onClick={() => {
          setVisible(false)
          requestAnimationFrame(() => restoreRef.current?.focus({ preventScroll: true }))
        }}><X /></Button>
      </div>
    </div>
    {children}
    <Button variant="ghost" className="camera-settings-toggle" aria-label="相机设置" aria-expanded={settingsOpen} aria-controls="camera-window-settings" onClick={() => setSettingsOpen(value => !value)}>
      <span><SlidersHorizontal />相机设置</span><ChevronDown className="camera-settings-chevron" />
    </Button>
    <ScrollArea id="camera-window-settings" className="camera-settings-scroll" hidden={!settingsOpen}>{settings}</ScrollArea>
  </div></>
}
