export type PlateGeometry = { slots: number; frames: number; repeats: number }
export type WorkbenchPlan = { geometry: PlateGeometry; rpm: number }
export type Calibration = { centerX: number; centerY: number; radius: number }
export type ExampleId = 'bounce' | 'sequence' | 'seam'
export type PlateMaterial =
  | { kind: 'example'; example: ExampleId }
  | { kind: 'image'; image: ImageBitmap; url: string; name: string; calibration: Calibration }

export const EXAMPLES: { id: ExampleId; name: string; description: string; geometry: PlateGeometry }[] = [
  { id: 'bounce', name: '弹跳', description: '平滑弹跳循环，适合观察同步与曝光。', geometry: { slots: 54, frames: 18, repeats: 3 } },
  { id: 'sequence', name: '计数', description: '编号从 01 递增，转臂连续转动。倒放时编号递减；末帧→01 的转臂应连续。', geometry: { slots: 48, frames: 12, repeats: 4 } },
]

export function geometryError({ slots, frames, repeats }: PlateGeometry): string | null {
  if (![slots, frames, repeats].every(Number.isInteger)) return '格数、独立帧数和重复次数必须是整数。'
  if (slots < 4 || slots > 180) return '圆周格数范围为 4–180。'
  if (frames < 2 || frames > 180) return '独立帧数范围为 2–180。'
  if (repeats < 1 || repeats > 90) return '重复次数范围为 1–90。'
  if (slots !== frames * repeats) return '圆周格数必须等于独立帧数 × 重复次数，才能完整铺满一圈。'
  return null
}

export function defaultCalibration(width: number, height: number): Calibration {
  return { centerX: width / 2, centerY: height / 2, radius: Math.min(width, height) / 2 }
}

export function calibrationError(c: Calibration, width: number, height: number): string | null {
  if (![c.centerX, c.centerY, c.radius].every(Number.isFinite)) return '请输入有效的圆心坐标和半径。'
  if (c.radius < 1) return '半径至少为 1 像素。'
  if (c.centerX - c.radius < 0 || c.centerY - c.radius < 0 || c.centerX + c.radius > width || c.centerY + c.radius > height) {
    return '校准圆必须完整位于图片内，请调整圆心或缩小半径。'
  }
  return null
}

/** Preserve circular geometry even when the original image is rectangular. */
export function imagePlacement(c: Calibration, size = 1200) {
  const radius = size * 292 / 600
  const scale = radius / c.radius
  return { scale, x: size / 2 - c.centerX * scale, y: size / 2 - c.centerY * scale, radius }
}

/** Map a point in an object-fit:contain preview back to original image pixels. */
export function previewPoint(x: number, y: number, viewWidth: number, viewHeight: number, imageWidth: number, imageHeight: number) {
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight)
  const imageX = (x - (viewWidth - imageWidth * scale) / 2) / scale
  const imageY = (y - (viewHeight - imageHeight * scale) / 2) / scale
  if (imageX < 0 || imageY < 0 || imageX > imageWidth || imageY > imageHeight) return null
  return { x: Math.round(imageX), y: Math.round(imageY) }
}

export function diagnosticPose(frame: number, frames: number, brokenSeam = false) {
  const index = brokenSeam && frame === frames - 1 ? 0 : frame
  return { index, ordinal: index + 1, angle: index / frames * Math.PI * 2 }
}
