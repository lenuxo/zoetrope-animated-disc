import test from 'node:test'
import assert from 'node:assert/strict'
import { CdRotation, cdRpm, DEFAULT_CD, cdConfigError } from '../src/simulation/cd.ts'
import { exposureSamples, matchedFps, Transport } from '../src/simulation/model.ts'
const close = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

test('CLV target preserves linear velocity at every reading radius', () => {
  const model = new CdRotation({ ...DEFAULT_CD, control: 'ideal' })
  for (const t of [0, 0.1, 4, 10, 20, 100]) {
    close(model.rpmAt(t) * 2 * Math.PI * model.radiusAt(t) / 60000, 1.2, 1e-7)
  }
  close(cdRpm(1.2, 25), 458.3662361046586)
  close(cdRpm(1.2, 58), 197.5716534933873)
  close(model.radiusAt(10) ** 2, (25 ** 2 + 58 ** 2) / 2)
})

test('integrated ideal rotation agrees with independent analytic CLV integral', () => {
  const model = new CdRotation({ ...DEFAULT_CD, control: 'ideal' })
  const slope = (58 ** 2 - 25 ** 2) / 20
  for (const t of [0.123, 2, 10.001, 20, 34]) {
    const scanTime = Math.min(t, 20)
    const angle = 2400 / slope * (Math.sqrt(25 ** 2 + slope * scanTime) - 25) + Math.max(0, t - 20) * 1200 / 58
    close(model.angleAt(t), angle, 0.00002)
  }
})

test('acceleration limit creates lag, never exceeds slope limit and settles at final radius', () => {
  const model = new CdRotation({ ...DEFAULT_CD, duration: 1, acceleration: 10 })
  assert.ok(model.rpmAt(0.5) > model.targetRpmAt(0.5))
  for (let t = 0; t < 28; t += 0.031) assert.ok(Math.abs(model.rpmAt(t + 0.01) - model.rpmAt(t)) <= 0.10000001)
  close(model.radiusAt(100), 58)
  close(model.rpmAt(100), model.targetRpmAt(100))
  close(model.angleAt(101) - model.angleAt(100), model.rpmAt(100) * Math.PI / 30)
})

test('inward scans accelerate and reverse direction preserves the same speed profile', () => {
  const config = { ...DEFAULT_CD, startRadius: 58, endRadius: 25, duration: 2, acceleration: 20 }
  const forward = new CdRotation(config)
  const reverse = new CdRotation(config, -1)
  assert.ok(forward.rpmAt(1) < forward.targetRpmAt(1))
  for (const t of [0, 1.337, 2, 40]) { close(reverse.rpmAt(t), -forward.rpmAt(t)); close(reverse.angleAt(t), -forward.angleAt(t)) }
})

test('fixed camera initially matches then drifts; exposure reads the same variable-speed trajectory', () => {
  const model = new CdRotation()
  const fps = matchedFps(model.rpmAt(0))
  const advance = (t: number) => (model.angleAt(t) - model.angleAt(t - 1 / fps)) * 54 / (2 * Math.PI)
  assert.ok(advance(0.01) > 0.99)
  assert.ok(advance(15) < 0.6)
  const samples = exposureSamples(model, 10, 0.02)
  assert.ok(samples.length > 1)
  for (const sample of samples) { close(sample.angle, model.angleAt(sample.time)); assert.ok(sample.time >= 9.98 && sample.time <= 10) }
})

test('pause, seek, repeat queries and manual phase leave controlled speed deterministic', () => {
  const model = new CdRotation()
  const clock = new Transport()
  clock.setPlaying(true, 0); clock.setPlaying(false, 3000)
  close(clock.timeAt(9000), 3)
  const angle = model.angleAt(3)
  model.angleAt(100); close(model.angleAt(3), angle)
  const speed = model.rpmAt(3)
  model.rotateBy(0.5); close(model.angleAt(3), angle + 0.5); close(model.rpmAt(3), speed)
  model.reset(); clock.seek(0, 10000); close(model.angleAt(clock.timeAt(10000)), 0); close(model.angleAt(3), angle)
})

test('equal radii produce constant speed and invalid drafts never reach the engine', () => {
  const model = new CdRotation({ ...DEFAULT_CD, endRadius: 25 })
  close(model.angleAt(100), model.rpmAt(0) * 100 * Math.PI / 30)
  for (const config of [{ ...DEFAULT_CD, duration: 0 }, { ...DEFAULT_CD, startRadius: NaN }, { ...DEFAULT_CD, endRadius: 60 }, { ...DEFAULT_CD, velocity: 0 }, { ...DEFAULT_CD, acceleration: -1 }]) {
    assert.ok(cdConfigError(config)); assert.throws(() => new CdRotation(config), RangeError)
  }
})
