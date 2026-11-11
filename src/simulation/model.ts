/** Seconds, signed RPM and unwrapped radians are the engine's canonical units. */
export interface RotationModel {
  angleAt(seconds: number): number
  rpmAt(seconds: number): number
  angularTravel(start: number, end: number): number
}

type Segment = {
  start: number
  angle: number
  rpm: number
  acceleration: number
}

const RADIANS_PER_RPM_SECOND = Math.PI / 30

/** A history of constant speeds / linear RPM ramps, integrated analytically.
 * Sampling and rendering depend only on RotationModel, never on a CSS duration.
 */
export class RotationTimeline implements RotationModel {
  private segments: Segment[] = []
  private phase = 0

  constructor(rpm = 100 / 3) {
    this.reset(rpm)
  }

  reset(rpm: number) {
    this.phase = 0
    this.segments = [{ start: 0, angle: 0, rpm, acceleration: 0 }]
  }

  /** Manual positioning while paused: shift the plate's phase, not simulation time.
   * Every camera/exposure query receives the same phase offset.
   */
  rotateBy(radians: number) {
    if (Number.isFinite(radians)) this.phase += radians
  }

  private segmentAt(seconds: number) {
    return this.segments.findLast((segment) => segment.start <= seconds) ?? this.segments[0]
  }

  angleAt(seconds: number) {
    const time = Math.max(0, seconds)
    const segment = this.segmentAt(time)
    const elapsed = time - segment.start
    return this.phase + segment.angle + RADIANS_PER_RPM_SECOND *
      (segment.rpm * elapsed + segment.acceleration * elapsed * elapsed / 2)
  }

  rpmAt(seconds: number) {
    const time = Math.max(0, seconds)
    const segment = this.segmentAt(time)
    return segment.rpm + segment.acceleration * (time - segment.start)
  }

  angularTravel(start: number, end: number) {
    // Walk backwards only through speed segments intersecting this shutter.
    let travel = 0
    let until = end
    for (let i = this.segments.length - 1; i >= 0 && until > start; i--) {
      const segment = this.segments[i]
      if (segment.start >= until) continue
      const from = Math.max(start, segment.start)
      const first = segment.rpm + segment.acceleration * (from - segment.start)
      const last = segment.rpm + segment.acceleration * (until - segment.start)
      // Integrate |RPM|. A ramp crossing zero has two triangular areas.
      const meanSpeed = first * last < 0
        ? (first * first + last * last) / (2 * Math.abs(last - first))
        : Math.abs(first + last) / 2
      travel += meanSpeed * (until - from) * RADIANS_PER_RPM_SECOND
      until = from
    }
    return travel
  }

  /** Preserve all past motion and phase. Editing after seeking branches the future.
   * rampSeconds > 0 supports controlled acceleration, e.g. future CD profiles.
   */
  setSpeedAt(seconds: number, targetRpm: number, rampSeconds = 0) {
    if (![seconds, targetRpm, rampSeconds].every(Number.isFinite) || seconds < 0 || rampSeconds < 0) {
      throw new RangeError('Invalid rotation parameters')
    }
    const angle = this.angleAt(seconds) - this.phase
    const rpm = this.rpmAt(seconds)
    this.segments = this.segments.filter((segment) => segment.start < seconds)
    if (rampSeconds > 0) {
      this.segments.push({ start: seconds, angle, rpm, acceleration: (targetRpm - rpm) / rampSeconds })
      const endAngle = angle + RADIANS_PER_RPM_SECOND * (rpm + targetRpm) / 2 * rampSeconds
      this.segments.push({ start: seconds + rampSeconds, angle: endAngle, rpm: targetRpm, acceleration: 0 })
    } else {
      this.segments.push({ start: seconds, angle, rpm: targetRpm, acceleration: 0 })
    }
  }
}

/** Wall time is injected, so pausing, seeking and tests share one deterministic clock. */
export class Transport {
  private position = 0
  private anchor = 0
  private playing = false

  timeAt(wallMilliseconds: number) {
    return this.position + (this.playing ? Math.max(0, wallMilliseconds - this.anchor) / 1000 : 0)
  }

  setPlaying(playing: boolean, wallMilliseconds: number) {
    this.position = this.timeAt(wallMilliseconds)
    this.anchor = wallMilliseconds
    this.playing = playing
  }

  seek(seconds: number, wallMilliseconds: number) {
    this.position = Math.max(0, seconds)
    this.anchor = wallMilliseconds
  }
}

export interface SamplingSchedule {
  indexAt(seconds: number): number
  timeAtIndex(index: number): number
}

export class FixedRateSchedule implements SamplingSchedule {
  readonly fps: number
  constructor(fps: number) {
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('FPS must be positive')
    this.fps = fps
  }
  indexAt(seconds: number) { return Math.max(0, Math.floor(seconds * this.fps + 1e-9)) }
  timeAtIndex(index: number) { return Math.max(0, index) / this.fps }
}

export const MAX_EXPOSURE_SAMPLES = 96
export const PLATE = { slots: 54, frames: 18, repeats: 3 } as const
export const matchedFps = (rpm: number, slots: number = PLATE.slots) => Math.abs(rpm) * slots / 60
export const slotsPerSample = (rpm: number, fps: number, slots: number = PLATE.slots) => rpm * slots / (60 * fps)

/** Net revolutions between camera samples. At frame zero use the starting speed. */
export function turnsPerSample(model: RotationModel, sampleTime: number, fps: number) {
  if (sampleTime <= 0) return Math.abs(model.rpmAt(0)) / (60 * fps)
  return Math.abs(model.angleAt(sampleTime) - model.angleAt(Math.max(0, sampleTime - 1 / fps))) / (2 * Math.PI)
}

export function sampleMatch(turns: number, slots: number, variableSpeed: boolean) {
  const advance = turns * slots
  const synchronized = Math.abs(advance - 1) < (variableSpeed ? 0.0005 : 0.00001)
  const label = synchronized ? (variableSpeed ? '近似逐格同步' : '逐格同步') : '采样失配'
  return { advance, synchronized, label }
}

/** Clockwise rotation brings slot -k into the top observation position at sample k. */
export const sourceFrameAtSlot = (slot: number, frames: number = PLATE.frames) => ((-slot % frames) + frames) % frames

/** Signed shortest pointer-angle change; crossing ±π must not cause a full-turn jump. */
export const angularDelta = (previous: number, next: number) => Math.atan2(Math.sin(next - previous), Math.cos(next - previous))

/** A trailing shutter interval; never reads motion from the future.
 * Midpoint quadrature of rotated copies, not a blur filter or animated artwork.
 */
export function exposureSamples(model: RotationModel, end: number, duration: number, size = 720) {
  const start = Math.max(0, end - Math.max(0, duration))
  const travel = model.angularTravel(start, end)
  const count = Math.max(1, Math.min(MAX_EXPOSURE_SAMPLES, Math.ceil(travel * size / 2 / 1.25)))
  return Array.from({ length: count }, (_, index) => {
    const time = start + (end - start) * (index + 0.5) / count
    return { time, angle: model.angleAt(time), weight: 1 / count }
  })
}
