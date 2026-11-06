import test from 'node:test'
import assert from 'node:assert/strict'
import { calibrationError, defaultCalibration, diagnosticPose, EXAMPLES, geometryError, imagePlacement, previewPoint } from '../src/simulation/plate.ts'
import { matchedFps, sourceFrameAtSlot } from '../src/simulation/model.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('all supplied examples have a complete, consistent circular layout', () => {
  for (const example of EXAMPLES) assert.equal(geometryError(example.geometry), null)
  assert.equal(geometryError({ slots: 40, frames: 20, repeats: 2 }), null)
  close(matchedFps(45, 40), 30)
})

test('incomplete loops, fractional counts, empty and excessive layouts are rejected', () => {
  for (const geometry of [
    { slots: 54, frames: 20, repeats: 3 }, { slots: 40.5, frames: 20, repeats: 2 },
    { slots: NaN, frames: 20, repeats: 2 }, { slots: 0, frames: 0, repeats: 0 },
    { slots: 200, frames: 100, repeats: 2 }, { slots: 40, frames: 1, repeats: 40 },
  ]) assert.notEqual(geometryError(geometry), null)
})

test('default calibration inscribes the circle in a rectangular image', () => {
  assert.deepEqual(defaultCalibration(800, 600), { centerX: 400, centerY: 300, radius: 300 })
  assert.equal(calibrationError(defaultCalibration(800, 600), 800, 600), null)
  assert.notEqual(calibrationError({ centerX: 50, centerY: 50, radius: 60 }, 800, 600), null)
  assert.notEqual(calibrationError({ centerX: NaN, centerY: 100, radius: 50 }, 800, 600), null)
  assert.notEqual(calibrationError({ centerX: 100, centerY: 100, radius: 0 }, 800, 600), null)
})

test('off-center circle maps exactly to the rotation axis without anisotropic stretching', () => {
  const calibration = { centerX: 360, centerY: 220, radius: 200 }
  const transform = imagePlacement(calibration)
  close(calibration.centerX * transform.scale + transform.x, 600)
  close(calibration.centerY * transform.scale + transform.y, 600)
  close((calibration.centerX + calibration.radius) * transform.scale + transform.x, 600 + transform.radius)
  close((calibration.centerY + calibration.radius) * transform.scale + transform.y, 600 + transform.radius)
})

test('calibration clicks map to source pixels, accounting for contain letterboxing', () => {
  assert.deepEqual(previewPoint(200, 150, 400, 300, 800, 600), { x: 400, y: 300 })
  assert.deepEqual(previewPoint(200, 200, 400, 400, 800, 400), { x: 400, y: 200 })
  assert.equal(previewPoint(200, 50, 400, 400, 800, 400), null)
  assert.deepEqual(previewPoint(150, 200, 300, 400, 400, 800), { x: 200, y: 400 })
})

test('diagnostic disc advances 01→12 clockwise, reverses the counter anticlockwise', () => {
  for (const direction of [1, -1]) {
    const seen = Array.from({ length: 13 }, (_, k) => {
      const incoming = ((-direction * k % 48) + 48) % 48
      return diagnosticPose(sourceFrameAtSlot(incoming, 12), 12).ordinal
    })
    assert.deepEqual(seen, direction === 1 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1] : [1, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  }
})

test('good seam advances uniformly, intentionally faulty seam jumps then holds', () => {
  const last = diagnosticPose(11, 12)
  close(2 * Math.PI - last.angle, 2 * Math.PI / 12)
  assert.equal(diagnosticPose(11, 12, true).ordinal, 1)
  close(diagnosticPose(11, 12, true).angle, diagnosticPose(0, 12, true).angle)
  assert.equal(diagnosticPose(10, 12, true).ordinal, 11)
})
