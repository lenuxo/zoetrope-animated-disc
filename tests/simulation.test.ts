import test from 'node:test'
import assert from 'node:assert/strict'
import { angularDelta, exposureSamples, FixedRateSchedule, matchedFps, PLATE, RotationTimeline, slotsPerSample, sourceFrameAtSlot, Transport } from '../src/simulation/model.ts'

const TAU = Math.PI * 2
const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

test('33⅓ RPM + 54 slots produces exactly one slot per 30fps camera sample', () => {
  const motion = new RotationTimeline()
  const camera = new FixedRateSchedule(30)
  close(matchedFps(100 / 3), 30)
  close(slotsPerSample(100 / 3, 30), 1)
  for (let k = 0; k <= 540; k++) {
    close(motion.angleAt(camera.timeAtIndex(k)), k * TAU / PLATE.slots)
    const incomingSlot = ((-k % PLATE.slots) + PLATE.slots) % PLATE.slots
    assert.equal(sourceFrameAtSlot(incomingSlot), k % PLATE.frames)
  }
})

test('18 unique poses repeat three times and wrap without duplicating the endpoint', () => {
  for (let k = 0; k < PLATE.slots; k++) {
    assert.equal(sourceFrameAtSlot(k), sourceFrameAtSlot(k + 18))
    assert.notEqual(sourceFrameAtSlot(k), sourceFrameAtSlot(k + 1))
  }
  close(PLATE.frames / matchedFps(100 / 3), 0.6)
})

test('matching is calculated for each speed and plate geometry, without a fixed vinyl RPM assumption', () => {
  close(matchedFps(45, 40), 30)
  for (const rpm of [1, 45, 78, 500, 1200]) {
    const fps = matchedFps(rpm)
    const motion = new RotationTimeline(rpm)
    close(motion.angleAt(1 / fps) * PLATE.slots / TAU, 1)
    close(slotsPerSample(-rpm, fps), -1)
  }
})

test('2% faster camera drifts exactly three slots over five seconds', () => {
  const motion = new RotationTimeline()
  const fps = 30.6
  const camera = new FixedRateSchedule(fps)
  const samples = 153
  const traveledSlots = motion.angleAt(camera.timeAtIndex(samples)) / TAU * PLATE.slots
  close(traveledSlots - samples, -3)
  assert.notEqual(slotsPerSample(100 / 3, fps), 1)
})

test('fixed camera holds the previous sample and does not interpolate with monitor frames', () => {
  const camera = new FixedRateSchedule(30)
  assert.equal(camera.indexAt(0.034), 1)
  assert.equal(camera.indexAt(0.065), 1)
  assert.equal(camera.indexAt(0.067), 2)
  assert.equal(camera.indexAt(1 / 30), 1)
  assert.equal(camera.indexAt(0), 0)
})

test('speed changes and reversal preserve phase and past exposure history', () => {
  const motion = new RotationTimeline(30)
  const before = motion.angleAt(2)
  motion.setSpeedAt(2, 60)
  close(motion.angleAt(2), before)
  close(motion.angleAt(1), Math.PI)
  close(motion.angleAt(3), TAU * 2)
  motion.setSpeedAt(3, -60)
  close(motion.angleAt(3), TAU * 2)
  close(motion.angleAt(4), TAU)
  close(motion.angleAt(2.5), TAU * 1.5)
})

test('CD-style linear RPM ramp integrates analytically, including partial exposure windows', () => {
  const motion = new RotationTimeline(500)
  motion.setSpeedAt(0, 1000, 10)
  close(motion.rpmAt(5), 750)
  close(motion.rpmAt(10), 1000)
  close(motion.angleAt(10), TAU * 125)
  close(motion.angleAt(5), TAU * (500 * 5 + 25 * 25) / 60)
  close(motion.angleAt(11) - motion.angleAt(10), TAU * 1000 / 60)
  const samples = exposureSamples(motion, 5, 0.1)
  for (const sample of samples) close(sample.angle, motion.angleAt(sample.time))
  // The exposure interval integrates changing RPM, rather than using end-RPM × interval.
  assert.ok(motion.angleAt(5) - motion.angleAt(4.9) < TAU * 750 * 0.1 / 60)
})

test('editing a past time branches future motion without changing earlier angles', () => {
  const motion = new RotationTimeline(30)
  motion.setSpeedAt(2, 60, 2)
  const preserved = motion.angleAt(2.5)
  const phase = motion.angleAt(3)
  motion.setSpeedAt(3, 20)
  close(motion.angleAt(2.5), preserved)
  close(motion.angleAt(4), phase + TAU / 3)
  close(motion.rpmAt(10), 20)
})

test('exposure uses weighted rotated copies and a long shutter spans an entire slot', () => {
  const motion = new RotationTimeline()
  const short = exposureSamples(motion, 1, 0.001)
  const long = exposureSamples(motion, 1, 1 / 30)
  close(long.reduce((sum, sample) => sum + sample.weight, 0), 1)
  assert.ok(long.length > short.length)
  assert.ok(long.every((sample) => sample.time >= 1 - 1 / 30 && sample.time <= 1))
  close(motion.angleAt(1) - motion.angleAt(1 - 1 / 30), TAU / 54)
  assert.ok(long.at(-1)!.angle - long[0].angle > short.at(-1)!.angle - short[0].angle)
  assert.ok(exposureSamples(motion, 0, 1 / 30).every((sample) => sample.angle === 0))
})

test('transport preserves position on pause/resume, and seeks exactly one camera frame', () => {
  const clock = new Transport()
  clock.setPlaying(true, 1000)
  close(clock.timeAt(2500), 1.5)
  clock.setPlaying(false, 2500)
  close(clock.timeAt(9000), 1.5)
  clock.setPlaying(true, 9000)
  close(clock.timeAt(9500), 2)
  clock.setPlaying(false, 9500)
  const camera = new FixedRateSchedule(30)
  clock.seek(camera.timeAtIndex(camera.indexAt(clock.timeAt(9500)) + 1), 9500)
  close(clock.timeAt(12000), 61 / 30)
  clock.seek(-1, 12000)
  close(clock.timeAt(13000), 0)
})

test('manual scratching shifts the whole sampled plate without advancing time or changing RPM', () => {
  const motion = new RotationTimeline(30)
  const before = motion.angleAt(1)
  motion.rotateBy(Math.PI / 2)
  close(motion.angleAt(0), Math.PI / 2)
  close(motion.angleAt(1), before + Math.PI / 2)
  close(motion.rpmAt(1), 30)
  for (const sample of exposureSamples(motion, 1, 0.01)) {
    close(sample.angle, Math.PI * sample.time + Math.PI / 2)
  }
  motion.setSpeedAt(1, 60)
  close(motion.angleAt(1), before + Math.PI / 2)
  close(motion.angleAt(2), before + Math.PI / 2 + TAU)
  motion.reset(30)
  close(motion.angleAt(0), 0)
})

test('scratching crosses the ±π seam in either direction without jumping a full turn', () => {
  const degrees = Math.PI / 180
  close(angularDelta(179 * degrees, -179 * degrees), 2 * degrees)
  close(angularDelta(-179 * degrees, 179 * degrees), -2 * degrees)
  close(angularDelta(0, Math.PI / 2), Math.PI / 2)
})

test('shutter travel includes each reversal even when all three old probes coincide', () => {
  const motion = new RotationTimeline(60)
  motion.setSpeedAt(0.25, -60)
  motion.setSpeedAt(0.5, 60)
  motion.setSpeedAt(0.75, -60)
  close(motion.angularTravel(0, 1), TAU)
  close(motion.angularTravel(0.125, 0.375), TAU / 4)
  const samples = exposureSamples(motion, 1, 1, 1024)
  assert.equal(samples.length, 96)
  assert.ok(samples.some((sample) => sample.angle > 1.4))
  close(samples.reduce((sum, sample) => sum + sample.weight, 0), 1)
})

test('shutter travel includes a zero crossing inside one linear motor ramp', () => {
  const motion = new RotationTimeline(60)
  motion.setSpeedAt(0, -60, 2)
  close(motion.angularTravel(0, 2), TAU)
  close(motion.angularTravel(0.5, 1.5), TAU / 4)
  motion.setSpeedAt(1, 30)
  close(motion.angularTravel(0, 2), TAU)
})
