import type { PlateGeometry, PlateMaterial } from './plate.ts'
import { geometryError } from './plate.ts'

export type RingLayer = {
  id: string
  name: string
  enabled: boolean
  material: PlateMaterial
  geometry: PlateGeometry
  inner: number
  outer: number
  sourceInner: number
  sourceOuter: number
  phase: number
}

export function createDefaultRings(): RingLayer[] {
  return [
    { id: 'outer', name: '外圈', inner: 74, outer: 96, material: { kind: 'example', example: 'bounce' }, geometry: { slots: 54, frames: 18, repeats: 3 } },
    { id: 'middle', name: '中圈', inner: 49, outer: 71, material: { kind: 'example', example: 'sequence' }, geometry: { slots: 54, frames: 9, repeats: 6 } },
    { id: 'inner', name: '内圈', inner: 24, outer: 46, material: { kind: 'example', example: 'sequence' }, geometry: { slots: 54, frames: 27, repeats: 2 } },
  ].map((ring) => ({ ...ring, enabled: true, sourceInner: 60, sourceOuter: 94, phase: 0 })) as RingLayer[]
}

// Only these fields affect the pixels of one projected layer.
export function sameRingProjection(a: RingLayer, b: RingLayer) {
  return a.material === b.material && a.geometry === b.geometry &&
    a.inner === b.inner && a.outer === b.outer && a.phase === b.phase &&
    a.sourceInner === b.sourceInner && a.sourceOuter === b.sourceOuter
}

export function sameRingLayout(a?: RingLayer[], b?: RingLayer[]) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((ring, index) => {
    const next = b[index]
    return ring.id === next.id && ring.enabled === next.enabled && sameRingProjection(ring, next)
  })
}

export function ringError(ring: RingLayer): string | null {
  const geometry = geometryError(ring.geometry)
  if (geometry) return geometry
  if (![ring.inner, ring.outer, ring.sourceInner, ring.sourceOuter, ring.phase].every(Number.isFinite)) return '请输入有效的圆环位置与相位。'
  if (ring.inner < 20 || ring.inner > 82 || ring.outer > 98 || ring.outer - ring.inner < 5) return '目标内缘应为 20–82%，外缘不超过 98%，圆环宽度至少 5%。'
  if (ring.sourceInner < 0 || ring.sourceOuter > 100 || ring.sourceOuter - ring.sourceInner < 5) return '源图内外缘应位于 0–100%，选取宽度至少 5%。'
  if (ring.phase < -360 || ring.phase > 360) return '相位范围为 −360° 到 360°。'
  return null
}

/** Inverse polar warp. All units here are fractions of the calibrated disc radius.
 * No time is read: mapping is applied once when constructing the static disc.
 */
export function createRingProjector(ring: RingLayer, radius: number) {
  const inner = ring.inner / 100 * radius
  const outer = ring.outer / 100 * radius
  const sourceInner = ring.sourceInner / 100 * radius
  const sourceWidth = (ring.sourceOuter - ring.sourceInner) / 100 * radius
  const cosine = Math.cos(ring.phase * Math.PI / 180)
  const sine = Math.sin(ring.phase * Math.PI / 180)
  return {
    inner, outer,
    map(dx: number, dy: number, out: { x: number; y: number; distance: number }) {
      const distance = Math.hypot(dx, dy)
      if (distance < inner || distance > outer || distance === 0) return false
      const sr = sourceInner + (distance - inner) / (outer - inner) * sourceWidth
      const scale = sr / distance
      out.x = (dx * cosine + dy * sine) * scale
      out.y = (-dx * sine + dy * cosine) * scale
      out.distance = distance
      return true
    },
  }
}

export function ringSourcePoint(dx: number, dy: number, radius: number, ring: RingLayer) {
  const point = { x: 0, y: 0, distance: 0 }
  return createRingProjector(ring, radius).map(dx, dy, point) ? { x: point.x, y: point.y } : null
}

export function referenceRing(rings: RingLayer[], id: string) {
  return rings.find((ring) => ring.enabled && ring.id === id) ?? rings.find((ring) => ring.enabled)
}
