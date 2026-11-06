import type { RotationModel } from './model'

export type CdConfig = {
  startRadius: number
  endRadius: number
  duration: number
  velocity: number
  control: 'ideal' | 'limited'
  acceleration: number
}
export const DEFAULT_CD: CdConfig = { startRadius: 25, endRadius: 58, duration: 20, velocity: 1.2, control: 'limited', acceleration: 20 }
export const cdRpm = (velocity: number, radiusMm: number) => velocity * 60 / (2 * Math.PI * radiusMm / 1000)
export function cdConfigError(config: CdConfig) {
  if (!Object.values(config).filter((value) => typeof value === 'number').every(Number.isFinite)) return '请填写完整的有限数值。'
  if (config.startRadius < 25 || config.startRadius > 58 || config.endRadius < 25 || config.endRadius > 58) return '读取半径需在 25–58 mm 之间。'
  if (config.duration < 1 || config.duration > 120) return '扫描时长需在 1–120 秒之间。'
  if (config.velocity < 1.2 || config.velocity > 1.4) return '1× 线速度需在 1.2–1.4 m/s 之间。'
  if (config.acceleration < 10 || config.acceleration > 2000) return '加减速上限需在 10–2000 RPM/s 之间。'
  if (!['ideal', 'limited'].includes(config.control)) return '请选择有效的控制策略。'
  return null
}

/** Constant-pitch spiral + CLV implies r² is linear in time, not r.
 * Scan duration is compressed for demonstration; it is not a CD's playing time.
 * A deterministic 240 Hz control trajectory is integrated as piecewise-linear RPM.
 * Render / exposure queries only read this trajectory; browser FPS cannot affect it.
 */
export class CdRotation implements RotationModel {
  readonly config: CdConfig
  readonly direction: number
  private times = [0]
  private speeds: number[]
  private angles = [0]
  private phase = 0

  constructor(config: CdConfig = DEFAULT_CD, direction = 1) {
    const error = cdConfigError(config)
    if (error || ![1, -1].includes(direction)) throw new RangeError(error ?? 'Invalid direction')
    this.config = { ...config }
    this.direction = direction
    this.speeds = [this.targetRpmAt(0)]
    const dt = 1 / 240
    // Start already settled at the initial radius. Hold the final radius until settled.
    const end = config.duration + Math.abs(this.targetRpmAt(0) - this.targetRpmAt(config.duration)) / config.acceleration + dt
    const steps = Math.ceil(end / dt)
    for (let i = 1; i <= steps; i++) {
      const time = i * dt
      const target = this.targetRpmAt(time)
      const previous = this.speeds[i - 1]
      const speed = config.control === 'ideal' ? target : previous + Math.max(-config.acceleration * dt, Math.min(config.acceleration * dt, target - previous))
      this.times.push(time)
      this.speeds.push(speed)
      this.angles.push(this.angles[i - 1] + (previous + speed) / 2 * dt * Math.PI / 30)
    }
  }
  radiusAt(seconds: number) {
    const progress = Math.max(0, Math.min(1, seconds / this.config.duration))
    return Math.sqrt(this.config.startRadius ** 2 + (this.config.endRadius ** 2 - this.config.startRadius ** 2) * progress)
  }
  targetRpmAt(seconds: number) { return this.direction * cdRpm(this.config.velocity, this.radiusAt(seconds)) }
  private indexAt(seconds: number) { return Math.min(this.times.length - 1, Math.floor(Math.max(0, seconds) * 240)) }
  rpmAt(seconds: number) {
    const i = this.indexAt(seconds)
    const fraction = Math.min(1, (Math.max(0, seconds) - this.times[i]) * 240)
    return this.speeds[i] + ((this.speeds[i + 1] ?? this.speeds[i]) - this.speeds[i]) * fraction
  }
  angleAt(seconds: number) {
    const i = this.indexAt(seconds)
    const elapsed = Math.max(0, seconds) - this.times[i]
    const acceleration = i + 1 < this.speeds.length ? (this.speeds[i + 1] - this.speeds[i]) * 240 : 0
    return this.phase + this.angles[i] + (this.speeds[i] * elapsed + acceleration * elapsed ** 2 / 2) * Math.PI / 30
  }
  rotateBy(radians: number) { if (Number.isFinite(radians)) this.phase += radians }
  reset(_rpm?: number) { this.phase = 0 }
}
