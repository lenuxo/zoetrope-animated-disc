import { exposureSamples, PLATE, sourceFrameAtSlot } from './model'
import type { RotationModel } from './model'
import { diagnosticPose, imagePlacement } from './plate'
import type { PlateGeometry, PlateMaterial } from './plate'
import { createRingProjector } from './rings'
import type { RingLayer } from './rings'

const TAU = Math.PI * 2
const SIZE = 1200

/** Generated once: every motion frame is a rotated copy of these exact pixels. */
export function createPlate(material: PlateMaterial, geometry: PlateGeometry = PLATE, guides = false) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  if (material.kind === 'image') {
    const { x, y, scale, radius } = imagePlacement(material.calibration, SIZE)
    ctx.save()
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, radius, 0, TAU); ctx.clip()
    ctx.drawImage(material.image, x, y, material.image.width * scale, material.image.height * scale)
    ctx.restore()
    if (guides) drawImportedGuides(ctx, geometry)
    return canvas
  }
  ctx.scale(2, 2)
  ctx.translate(300, 300)
  const circle = (radius: number, color: string) => {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fillStyle = color; ctx.fill()
  }
  circle(292, 'oklch(0.22 0.018 260)')
  for (const radius of [286, 282, 278, 178, 173, 168, 163]) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU)
    ctx.strokeStyle = 'oklch(0.34 0.024 260)'; ctx.lineWidth = 0.7; ctx.stroke()
  }
  for (let slot = 0; slot < geometry.slots; slot++) {
    const frame = sourceFrameAtSlot(slot, geometry.frames)
    const phase = frame / geometry.frames * TAU
    const bounce = (1 - Math.cos(phase)) / 2
    ctx.save()
    ctx.rotate(slot / geometry.slots * TAU)
    const cellWidth = TAU * 225 / geometry.slots
    const markSize = Math.min(9, cellWidth * 0.3)
    if (material.example === 'bounce') {
      ctx.strokeStyle = 'oklch(0.58 0.035 260)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(-markSize, -188); ctx.lineTo(markSize, -188); ctx.stroke()
      ctx.fillStyle = 'oklch(0.88 0.075 245)'
      ctx.beginPath()
      ctx.ellipse(0, -(201 + bounce * 48), markSize * (0.8 - bounce * 0.22), markSize * (0.45 + bounce * 0.35), 0, 0, TAU)
      ctx.fill()
    } else {
      const pose = diagnosticPose(frame, geometry.frames, material.example === 'seam')
      ctx.save(); ctx.translate(0, -224)
      ctx.strokeStyle = 'oklch(0.9 0.08 245)'; ctx.lineWidth = Math.max(1, markSize * 0.2)
      ctx.beginPath(); ctx.arc(0, 0, markSize, 0, TAU); ctx.stroke()
      ctx.rotate(pose.angle)
      ctx.beginPath(); ctx.moveTo(0, markSize * 0.35); ctx.lineTo(0, -markSize); ctx.stroke()
      ctx.fillStyle = pose.index === 0 ? 'oklch(0.86 0.14 85)' : 'oklch(0.9 0.08 245)'
      ctx.beginPath(); ctx.moveTo(0, -markSize * 1.15); ctx.lineTo(-markSize * 0.35, -markSize * 0.45); ctx.lineTo(markSize * 0.35, -markSize * 0.45); ctx.closePath(); ctx.fill()
      ctx.restore()
      ctx.fillStyle = pose.index === 0 ? 'oklch(0.86 0.14 85)' : 'oklch(0.93 0.025 250)'
      ctx.textAlign = 'center'; ctx.font = `600 ${Math.max(4, Math.min(12, cellWidth * 0.42))}px system-ui`
      ctx.fillText(String(pose.ordinal).padStart(2, '0'), 0, -245)
    }
    if (guides) {
      ctx.strokeStyle = 'oklch(0.65 0.06 250)'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, -260); ctx.lineTo(0, -272); ctx.stroke()
      ctx.fillStyle = 'oklch(0.84 0.025 250)'; ctx.font = '7px system-ui'; ctx.textAlign = 'center'
      ctx.fillText(String(slot + 1).padStart(2, '0'), 0, -263)
      ctx.fillStyle = 'oklch(0.75 0.035 250)'
      ctx.fillText(String(sourceFrameAtSlot(slot, geometry.frames) + 1), 0, -179)
    }
    ctx.restore()
  }
  circle(106, 'oklch(0.49 0.21 264)')
  ctx.textAlign = 'center'; ctx.fillStyle = 'oklch(1 0 0)'
  ctx.font = '600 19px system-ui'; ctx.fillText('ZOETROPE', 0, -30)
  ctx.font = '10px system-ui'; ctx.fillStyle = 'oklch(0.9 0.035 250)'
  ctx.fillText(`${geometry.slots} POSITIONS / ${geometry.frames} FRAMES`, 0, 40)
  ctx.fillText(`${material.example === 'bounce' ? 'BOUNCE' : material.example === 'seam' ? 'SEAM ERROR' : 'SEQUENCE'} · REPEAT × ${geometry.repeats}`, 0, 57)
  circle(9, 'oklch(0.98 0 0)')
  ctx.fillStyle = 'oklch(1 0 0)'; ctx.beginPath(); ctx.arc(0, -284, 3, 0, TAU); ctx.fill()
  return canvas
}

function drawImportedGuides(ctx: CanvasRenderingContext2D, geometry: PlateGeometry) {
  ctx.save(); ctx.scale(2, 2); ctx.translate(300, 300)
  ctx.textAlign = 'center'; ctx.font = '8px system-ui'
  for (let slot = 0; slot < geometry.slots; slot++) {
    ctx.save(); ctx.rotate(slot / geometry.slots * TAU)
    ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2
    const text = String(slot + 1)
    ctx.strokeText(text, 0, -275); ctx.fillText(text, 0, -275)
    ctx.restore()
  }
  ctx.restore()
}

export function renderExposure(
  ctx: CanvasRenderingContext2D,
  plate: HTMLCanvasElement,
  model: RotationModel,
  time: number,
  exposure: number,
) {
  const size = ctx.canvas.width
  const samples = exposureSamples(model, time, exposure, size)
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  // Add weighted premultiplied pixels. Source-over at fixed alpha would bias later samples.
  ctx.globalCompositeOperation = 'lighter'
  for (const sample of samples) {
    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.rotate(sample.angle % TAU)
    ctx.globalAlpha = sample.weight
    ctx.drawImage(plate, -size / 2, -size / 2, size, size)
    ctx.restore()
  }
  ctx.restore()
  return samples.length
}

/** Flatten all enabled annuli before motion/exposure. Later layers cover earlier layers. */
export function createCompositePlate(rings: RingLayer[], guides = false) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const center = SIZE / 2
  const radius = SIZE * 292 / 600
  ctx.fillStyle = 'oklch(0.22 0.018 260)'
  ctx.beginPath(); ctx.arc(center, center, radius, 0, TAU); ctx.fill()

  for (const ring of rings.filter((item) => item.enabled)) {
    const source = createPlate(ring.material, ring.geometry, false).getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data
    const layer = ctx.createImageData(SIZE, SIZE)
    const projection = createRingProjector(ring, radius)
    const { inner, outer } = projection
    const mapped = { x: 0, y: 0, distance: 0 }
    const min = Math.max(0, Math.floor(center - outer - 1))
    const max = Math.min(SIZE - 1, Math.ceil(center + outer + 1))
    for (let y = min; y <= max; y++) {
      const dy = y + 0.5 - center
      for (let x = min; x <= max; x++) {
        const dx = x + 0.5 - center
        if (!projection.map(dx, dy, mapped)) continue
        const distance = mapped.distance
        const sx = center + mapped.x - 0.5
        const sy = center + mapped.y - 0.5
        const ix = Math.max(0, Math.min(SIZE - 2, Math.floor(sx)))
        const iy = Math.max(0, Math.min(SIZE - 2, Math.floor(sy)))
        const fx = Math.max(0, Math.min(1, sx - ix))
        const fy = Math.max(0, Math.min(1, sy - iy))
        const i00 = (iy * SIZE + ix) * 4
        const i10 = i00 + 4
        const i01 = i00 + SIZE * 4
        const i11 = i01 + 4
        const a00 = source[i00 + 3] / 255 * (1 - fx) * (1 - fy)
        const a10 = source[i10 + 3] / 255 * fx * (1 - fy)
        const a01 = source[i01 + 3] / 255 * (1 - fx) * fy
        const a11 = source[i11 + 3] / 255 * fx * fy
        const alpha = a00 + a10 + a01 + a11
        const index = (y * SIZE + x) * 4
        if (alpha === 0) continue
        for (let channel = 0; channel < 3; channel++) {
          layer.data[index + channel] = (source[i00 + channel] * a00 + source[i10 + channel] * a10 + source[i01 + channel] * a01 + source[i11 + channel] * a11) / alpha
        }
        layer.data[index + 3] = alpha * 255 * Math.min(1, distance - inner, outer - distance)
      }
    }
    const buffer = document.createElement('canvas')
    buffer.width = buffer.height = SIZE
    buffer.getContext('2d')!.putImageData(layer, 0, 0)
    ctx.drawImage(buffer, 0, 0)
    if (guides) {
      ctx.save(); ctx.translate(center, center)
      const labelRadius = outer - Math.min(10, (outer - inner) * 0.15)
      const fontSize = Math.max(4, Math.min(12, TAU * labelRadius / ring.geometry.slots * 0.35))
      ctx.font = `${fontSize}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.strokeStyle = 'oklch(0.15 0 0)'; ctx.lineWidth = 2
      for (let slot = 0; slot < ring.geometry.slots; slot++) {
        ctx.save(); ctx.rotate(slot / ring.geometry.slots * TAU + ring.phase * Math.PI / 180)
        const text = ring.material.kind === 'image' ? String(slot + 1) : `${slot + 1}/${sourceFrameAtSlot(slot, ring.geometry.frames) + 1}`
        ctx.strokeText(text, 0, -labelRadius); ctx.fillText(text, 0, -labelRadius)
        ctx.restore()
      }
      ctx.restore()
    }
  }
  const enabled = rings.filter((ring) => ring.enabled)
  const labelRadius = enabled.length ? Math.min(80, ...enabled.map((ring) => ring.inner / 100 * radius * 0.8)) : 80
  ctx.fillStyle = 'oklch(0.49 0.21 264)'
  ctx.beginPath(); ctx.arc(center, center, labelRadius, 0, TAU); ctx.fill()
  ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '600 14px system-ui'
  if (labelRadius > 40) ctx.fillText('RINGS', center, center - 20)
  ctx.beginPath(); ctx.arc(center, center, 9, 0, TAU); ctx.fill()
  return canvas
}
