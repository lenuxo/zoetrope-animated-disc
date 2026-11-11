import { test, expect } from '@playwright/test'

for (const backend of ['webgl2', 'canvas2d']) {
  test(`${backend} preserves premultiplied color, empty pixels and clockwise orientation`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async (backend) => {
      const getContext = HTMLCanvasElement.prototype.getContext
      let gpuUsed = false
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, ...args) {
        if (type === 'webgl2' && backend === 'canvas2d') return null
        const context = getContext.call(this, type, ...args)
        if (type === 'webgl2' && context) {
          const gl = context as WebGL2RenderingContext
          const draw = gl.drawArrays.bind(gl)
          gl.drawArrays = (...args) => { gpuUsed = true; draw(...args) }
        }
        return context
      } as typeof getContext
      const modulePath = '/src/simulation/exposure.ts'
      const { drawExposure } = await import(modulePath)
      const canvas = () => {
        const el = document.createElement('canvas')
        el.width = el.height = 64
        return el
      }
      const output = canvas().getContext('2d')!
      const pixel = (x: number, y: number) => [...output.getImageData(x, y, 1, 1).data]
      const source = canvas()
      const ctx = source.getContext('2d')!
      ctx.fillStyle = 'rgba(255,0,0,0.5)'
      ctx.fillRect(8, 24, 16, 16)
      ctx.fillStyle = 'blue'
      ctx.fillRect(40, 24, 16, 16)
      drawExposure(output, source, [{ angle: 0 }, { angle: Math.PI }])
      const mixed = pixel(16, 32)
      drawExposure(output, source, [{ angle: Math.PI / 2 }, { angle: Math.PI / 2 }])
      return { gpuUsed, mixed, bottom: pixel(32, 48), empty: pixel(3, 3) }
    }, backend)
    expect(result.gpuUsed).toBe(backend === 'webgl2')
    expect(result.bottom).toEqual([0, 0, 255, 255])
    expect(result.empty).toEqual([0, 0, 0, 0])
    for (const [i, value] of [85, 0, 170, 192].entries()) expect(Math.abs(result.mixed[i] - value)).toBeLessThanOrEqual(1)
  })
}
