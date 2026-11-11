import { memo, useEffect, useRef, useState } from 'react'
import { Upload, Disc3, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calibrationError, defaultCalibration, EXAMPLES, geometryError, previewPoint } from '../simulation/plate'
import type { Calibration, PlateGeometry, PlateMaterial } from '../simulation/plate'

type UploadedPlate = Extract<PlateMaterial, { kind: 'image' }>
type Props = {
  material: PlateMaterial
  idPrefix?: string
  embedded?: boolean
  geometry: PlateGeometry
  onSelect: (material: PlateMaterial, geometry?: PlateGeometry) => void
  onGeometryChange: (geometry: PlateGeometry) => void
}
const calibrationFields = (c: Calibration) => ({ centerX: String(c.centerX), centerY: String(c.centerY), radius: String(c.radius) })
const geometryFields = (g: PlateGeometry) => ({ slots: String(g.slots), frames: String(g.frames), repeats: String(g.repeats) })
const parsedNumber = (value: string) => value.trim() === '' ? NaN : Number(value)

export const PlateEditor = memo(function PlateEditor({ material, geometry, onSelect, onGeometryChange, idPrefix = 'plate', embedded = false }: Props) {
  const editorId = `${idPrefix}-editor`
  const calibrationPrefix = idPrefix === 'plate' ? 'calibration' : `${idPrefix}-calibration`
  const [uploaded, setUploaded] = useState<UploadedPlate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [calibrationMode, setCalibrationMode] = useState<'center' | 'radius'>('center')
  const [draft, setDraft] = useState({ centerX: '', centerY: '', radius: '' })
  const [geometryDraft, setGeometryDraft] = useState(() => geometryFields(geometry))
  const request = useRef({ value: 0 })
  const lifetime = useRef({ generation: 0 })
  const latestOnSelect = useRef(onSelect)
  const urls = useRef(new Set<string>())
  const uploadedRef = useRef<{ material: UploadedPlate | null }>({ material: null })
  const uploadedGeometry = useRef<PlateGeometry>(geometry)
  const latestGeometry = useRef(geometry)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    latestGeometry.current = geometry
    setGeometryDraft(geometryFields(geometry))
    if (material.kind === 'image') uploadedGeometry.current = geometry
  }, [geometry, material.kind])
  useEffect(() => { latestOnSelect.current = onSelect }, [onSelect])
  useEffect(() => {
    const life = lifetime.current
    const requests = request.current
    const ownedUrls = urls.current
    const owner = uploadedRef.current
    const generation = ++life.generation
    return () => {
      requests.value++
      // StrictMode and Fast Refresh replace effect setup while retaining resources.
      queueMicrotask(() => {
        if (life.generation !== generation) return
        for (const url of ownedUrls) URL.revokeObjectURL(url)
        ownedUrls.clear()
        owner.material?.image.close()
      })
    }
  }, [])


  const release = (url: string) => { URL.revokeObjectURL(url); urls.current.delete(url) }
  const loadFile = (file: File) => {
    const id = ++request.current.value
    setError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setBusy(false); setError('请选择 PNG、JPEG 或 WebP 静态图片。'); return
    }
    if (file.size > 20 * 1024 * 1024) {
      setBusy(false); setError('图片超过 20 MB，请缩小后再选择。'); return
    }
    setBusy(true)
    const url = URL.createObjectURL(file)
    urls.current.add(url)
    const image = new Image()
    image.onload = async () => {
      if (id !== request.current.value) { release(url); return }
      if (image.naturalWidth < 2 || image.naturalHeight < 2) {
        release(url); setBusy(false); setError('图片宽高至少为 2 像素，才能设置有效的校准圆。'); return
      }
      if (image.naturalWidth * image.naturalHeight > 24_000_000) {
        release(url); setBusy(false); setError('图片超过 2400 万像素，请缩小后再选择。'); return
      }
      try {
        // Freeze decoded pixels once, including animated PNG/WebP inputs.
        // Rebuilding guides or calibration must never advance an uploaded image.
        const bitmap = await createImageBitmap(image)
        if (id !== request.current.value) { bitmap.close(); release(url); return }
        const next: UploadedPlate = { kind: 'image', image: bitmap, url, name: file.name, calibration: defaultCalibration(bitmap.width, bitmap.height) }
        const previous = uploadedRef.current.material
        uploadedRef.current.material = next
        uploadedGeometry.current = { ...latestGeometry.current }
        setUploaded(next)
        setDraft(calibrationFields(next.calibration))
        setBusy(false)
        latestOnSelect.current(next)
        if (previous) { release(previous.url); previous.image.close() }
      } catch {
        release(url)
        if (id === request.current.value) { setBusy(false); setError('图片无法读取，请尝试其他图片。') }
      }
    }
    image.onerror = () => {
      release(url)
      if (id === request.current.value) { setBusy(false); setError('图片无法解码，请选择有效的 PNG、JPEG 或 WebP 文件。') }
    }
    image.src = url
  }

  const calibration = { centerX: parsedNumber(draft.centerX), centerY: parsedNumber(draft.centerY), radius: parsedNumber(draft.radius) }
  const imageMaterial = material.kind === 'image' ? material : null
  const calibrationIssue = imageMaterial ? calibrationError(calibration, imageMaterial.image.width, imageMaterial.image.height) : null
  const proposed = { slots: parsedNumber(geometryDraft.slots), frames: parsedNumber(geometryDraft.frames), repeats: parsedNumber(geometryDraft.repeats) }
  const geometryIssue = geometryError(proposed)
  const geometryChanged = proposed.slots !== geometry.slots || proposed.frames !== geometry.frames || proposed.repeats !== geometry.repeats
  const calibrationChanged = imageMaterial && Object.keys(calibration).some((key) => calibration[key as keyof Calibration] !== imageMaterial.calibration[key as keyof Calibration])

  return (
    <section id={editorId} aria-labelledby={embedded ? undefined : `${editorId}-title`} aria-label={embedded ? '本圈素材与循环' : undefined} className="plate-editor min-w-0">
      {!embedded && <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div><h3 id={`${editorId}-title`} className="flex items-center gap-2 text-sm font-semibold"><Disc3 className="size-4" />盘面素材与校准</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">应用素材、校准或排布配置时，预览会暂停并回到起点。</p></div>

      </div>}
      <div className="space-y-5">
        <div>
          <Label className="mb-3 block">{embedded ? '本圈素材' : '内置示例'}</Label>
          <div role="group" aria-label="盘面示例" className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => <Button key={example.id} variant={material.kind === 'example' && material.example === example.id ? 'default' : 'outline'} aria-pressed={material.kind === 'example' && material.example === example.id} size="sm" onClick={() => {
              request.current.value++; setBusy(false); setError(''); setGeometryDraft(geometryFields(example.geometry)); onSelect({ kind: 'example', example: example.id }, { ...example.geometry })
            }}>{example.name}</Button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{material.kind === 'example' ? EXAMPLES.find((example) => example.id === material.example)!.description : `当前使用：${material.name}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" tabIndex={-1} aria-hidden="true" className="sr-only" aria-label="上传盘面图片" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) loadFile(file) }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" />{busy ? '正在读取图片…' : '上传盘面图片'}</Button>
          {uploaded && material.kind !== 'image' && <Button variant="secondary" onClick={() => { request.current.value++; setBusy(false); setDraft(calibrationFields(uploaded.calibration)); setGeometryDraft(geometryFields(uploadedGeometry.current)); onSelect(uploaded, { ...uploadedGeometry.current }) }}>使用已上传图片</Button>}
          <p className="text-xs leading-5 text-muted-foreground">PNG / JPEG / WebP，最大 20 MB、2400 万像素。导入时固定为静态画面，仅本地处理；刷新后需重新选择。</p>
          {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
        </div>

        {imageMaterial && <div className="grid min-w-0 gap-5 border-t pt-5">
          <div className="min-w-0">
            <div role="group" aria-label="图片校准操作" className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" variant={calibrationMode === 'center' ? 'default' : 'outline'} aria-pressed={calibrationMode === 'center'} onClick={() => setCalibrationMode('center')}><Crosshair className="size-4" />设置圆心</Button>
              <Button size="sm" variant={calibrationMode === 'radius' ? 'default' : 'outline'} aria-pressed={calibrationMode === 'radius'} onClick={() => setCalibrationMode('radius')}>设置半径</Button>
            </div>
            <button type="button" aria-label={calibrationMode === 'center' ? '在原图上点击设置圆心' : '在原图边缘点击设置半径'} className="relative block h-56 w-full overflow-hidden rounded-lg border bg-muted" style={{ cursor: 'crosshair' }} onClick={(event) => {
              if (event.detail === 0) return
              const bounds = event.currentTarget.getBoundingClientRect()
              const point = previewPoint(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height, imageMaterial.image.width, imageMaterial.image.height)
              if (!point) return
              if (calibrationMode === 'center') setDraft((value) => ({ ...value, centerX: String(point.x), centerY: String(point.y) }))
              else if (Number.isFinite(calibration.centerX) && Number.isFinite(calibration.centerY)) setDraft((value) => ({ ...value, radius: String(Math.round(Math.hypot(point.x - calibration.centerX, point.y - calibration.centerY))) }))
            }}>
              <canvas role="img" aria-label="待校准的原始盘面" width={Math.min(1024, imageMaterial.image.width)} height={Math.max(1, Math.round(Math.min(1024, imageMaterial.image.width) * imageMaterial.image.height / imageMaterial.image.width))} ref={(canvas) => { if (canvas) canvas.getContext('2d')!.drawImage(imageMaterial.image, 0, 0, canvas.width, canvas.height) }} className="absolute inset-0 size-full object-contain" />
              <svg aria-hidden="true" viewBox={`0 0 ${imageMaterial.image.width} ${imageMaterial.image.height}`} className="pointer-events-none absolute inset-0 size-full">
                {[calibration.centerX, calibration.centerY, calibration.radius].every(Number.isFinite) && <g fill="none" stroke={calibrationIssue ? 'var(--destructive)' : 'white'} strokeWidth="2">
                  <circle cx={calibration.centerX} cy={calibration.centerY} r={Math.max(0, calibration.radius)} vectorEffect="non-scaling-stroke" />
                  <path d={`M${calibration.centerX - 12},${calibration.centerY}h24 M${calibration.centerX},${calibration.centerY - 12}v24`} vectorEffect="non-scaling-stroke" />
                </g>}
              </svg>
            </button>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">先点实际圆心，再切换“设置半径”点击盘片外缘。也可直接输入原图像素坐标。</p>
          </div>
          <form className="min-w-0 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!calibrationIssue) { const next = { ...imageMaterial, calibration }; setUploaded(next); uploadedRef.current.material = next; onSelect(next) } }}>
            <h3 className="text-sm font-medium">圆心与半径</h3>
            <p className="break-all text-xs text-muted-foreground">{imageMaterial.name} · {imageMaterial.image.width} × {imageMaterial.image.height} px</p>
            <div className="grid grid-cols-3 gap-3">
              {(['centerX', 'centerY', 'radius'] as const).map((key) => <div key={key} className="space-y-2"><Label htmlFor={`${calibrationPrefix}-${key}`}>{key === 'centerX' ? '圆心 X' : key === 'centerY' ? '圆心 Y' : '半径'}</Label><Input id={`${calibrationPrefix}-${key}`} type="number" step="any" value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
            </div>
            {calibrationIssue && <p role="alert" className="text-sm text-destructive">{calibrationIssue}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!!calibrationIssue || !calibrationChanged}>应用校准</Button><Button type="button" variant="outline" onClick={() => setDraft(calibrationFields(defaultCalibration(imageMaterial.image.width, imageMaterial.image.height)))}>居中内切圆</Button><Button type="button" variant="ghost" onClick={() => setDraft(calibrationFields(imageMaterial.calibration))}>撤销未应用修改</Button></div>
            <p role="status" className="text-xs leading-5 text-muted-foreground">{calibrationChanged ? '校准尚未应用，模拟器仍使用上次应用的圆心与半径。' : '校准已应用。选定圆形区域会等比对齐旋转轴，圆外内容不参与旋转。'}</p>
          </form>
        </div>}

        <form className="space-y-4 border-t pt-5" onSubmit={(event) => { event.preventDefault(); if (!geometryIssue) { if (material.kind === 'image') uploadedGeometry.current = { ...proposed }; onGeometryChange(proposed) } }}>
          <div><h3 className="text-sm font-medium">{embedded ? '动作循环' : '圆周排布'}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">格数 = 独立帧数 × 重复次数。{material.kind === 'image' ? '这些参数描述原图的已有排布，不会重排或补帧，也不会自动识别动画。' : '内置示例会按此配置重新生成完整静态盘面。'}</p></div>
          <div className="grid max-w-xl grid-cols-3 gap-3">
            {(['slots', 'frames', 'repeats'] as const).map((key) => <div key={key} className="space-y-2"><Label htmlFor={`${idPrefix}-${key}`}>{key === 'slots' ? '圆周格数' : key === 'frames' ? '独立帧数' : '重复次数'}</Label><Input id={`${idPrefix}-${key}`} type="number" min={key === 'repeats' ? 1 : key === 'slots' ? 4 : 2} max={key === 'repeats' ? 90 : 180} step="1" value={geometryDraft[key]} onChange={(event) => setGeometryDraft((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
          </div>
          {geometryIssue && <p role="alert" className="text-sm text-destructive">{geometryIssue}</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!!geometryIssue || !geometryChanged}>应用排布</Button><Button type="button" variant="outline" onClick={() => setGeometryDraft((value) => ({ ...value, slots: String(Number(value.frames) * Number(value.repeats)) }))}>按帧数 × 重复计算格数</Button><Button type="button" variant="ghost" onClick={() => setGeometryDraft(geometryFields(geometry))}>撤销修改</Button></div>
          <p role="status" className="text-xs text-muted-foreground">已应用：{geometry.slots} 格 / {geometry.frames} 帧 × {geometry.repeats}。采样匹配使用已应用格数。</p>
        </form>
      </div>
    </section>
  )
})
