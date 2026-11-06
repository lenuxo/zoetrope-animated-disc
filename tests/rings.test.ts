import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultRings, referenceRing, ringError, ringSourcePoint } from '../src/simulation/rings.ts'
import { matchedFps, sourceFrameAtSlot, slotsPerSample } from '../src/simulation/model.ts'
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)

test('three rings share a sampling grid but have independent action periods', () => {
  const rings = createDefaultRings()
  const fps = matchedFps(100 / 3, rings[0].geometry.slots)
  for (const ring of rings) {
    assert.equal(ringError(ring), null)
    close(slotsPerSample(100 / 3, fps, ring.geometry.slots), 1)
    for (let k = 0; k < 54; k++) {
      const incoming = ((-k % 54) + 54) % 54
      assert.equal(sourceFrameAtSlot(incoming, ring.geometry.frames), k % ring.geometry.frames)
    }
  }
  rings.forEach((ring, index) => close(ring.geometry.frames / fps, [0.6, 0.3, 0.9][index]))
})

test('changing one ring slot count does not falsely match every ring', () => {
  const rings = createDefaultRings()
  rings[1].geometry = { slots: 40, frames: 10, repeats: 4 }
  const fps = matchedFps(100 / 3, rings[0].geometry.slots)
  close(slotsPerSample(100 / 3, fps, rings[0].geometry.slots), 1)
  close(slotsPerSample(100 / 3, fps, rings[1].geometry.slots), 40 / 54)
  const nextFps = matchedFps(100 / 3, rings[1].geometry.slots)
  close(slotsPerSample(100 / 3, nextFps, rings[1].geometry.slots), 1)
  close(slotsPerSample(100 / 3, nextFps, rings[0].geometry.slots), 54 / 40)
})

test('annulus maps inner, middle and outer radii without introducing time-dependent motion', () => {
  const ring = createDefaultRings()[0]
  const radius = 600
  close(ringSourcePoint(0, -radius * ring.inner / 100, radius, ring)!.y, -radius * ring.sourceInner / 100)
  close(ringSourcePoint(0, -radius * ring.outer / 100, radius, ring)!.y, -radius * ring.sourceOuter / 100)
  const point = ringSourcePoint(0, -radius * (ring.inner + ring.outer) / 200, radius, ring)!
  close(point.x, 0)
  close(point.y, -radius * (ring.sourceInner + ring.sourceOuter) / 200)
  assert.equal(ringSourcePoint(0, 0, radius, ring), null)
  assert.equal(ringSourcePoint(radius, 0, radius, ring), null)
})

test('per-ring phase is baked into the static disc with the correct rotation direction', () => {
  const ring = { ...createDefaultRings()[0], phase: 90 }
  const radius = 600
  const point = ringSourcePoint(0, -radius * (ring.inner + ring.outer) / 200, radius, ring)!
  close(point.x, -radius * (ring.sourceInner + ring.sourceOuter) / 200)
  close(point.y, 0)
})

test('ring validation rejects inverted, zero-width, out-of-bounds and incomplete loops', () => {
  const ring = createDefaultRings()[0]
  for (const patch of [{ inner: 90 }, { outer: ring.inner }, { sourceInner: 95 }, { sourceOuter: 101 }, { phase: NaN }, { inner: 0 }, { geometry: { slots: 40, frames: 18, repeats: 3 } }]) {
    assert.notEqual(ringError({ ...ring, ...patch }), null)
  }
})

test('hidden or deleted reference falls back to an enabled ring, with an explicit empty state', () => {
  const rings = createDefaultRings()
  assert.equal(referenceRing(rings, 'outer')!.id, 'outer')
  rings[0].enabled = false
  assert.equal(referenceRing(rings, 'outer')!.id, 'middle')
  assert.equal(referenceRing(rings.slice(1), 'outer')!.id, 'middle')
  rings.forEach((ring) => { ring.enabled = false })
  assert.equal(referenceRing(rings, 'outer'), undefined)
})
