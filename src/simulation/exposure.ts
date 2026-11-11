import { MAX_EXPOSURE_SAMPLES } from './model'

// Accumulate premultiplied samples before converting to the 8-bit display canvas.
type Sample = { angle: number }
const vertex = `#version 300 es
out vec2 point;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  point = vec2(p.x, -p.y) * 0.5;
}`
const fragment = `#version 300 es
precision highp float;
uniform sampler2D plate;
uniform vec2 rotations[${MAX_EXPOSURE_SAMPLES}];
uniform int count;
in vec2 point;
out vec4 color;
void main() {
  vec4 total = vec4(0);
  for (int i = 0; i < count; ++i) {
    vec2 r = rotations[i];
    vec2 uv = vec2(r.x * point.x + r.y * point.y, -r.y * point.x + r.x * point.y) + 0.5;
    if (all(greaterThanEqual(uv, vec2(0))) && all(lessThanEqual(uv, vec2(1)))) {
      total += texture(plate, uv);
    }
  }
  color = total / float(count);
}`

function createGpuExposure(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { depth: false, stencil: false, antialias: false, premultipliedAlpha: true })
  if (!gl) return null
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  gl.useProgram(program)
  gl.disable(gl.DITHER)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  const angles = gl.getUniformLocation(program, 'rotations[0]')
  const count = gl.getUniformLocation(program, 'count')
  const rotations = new Float32Array(MAX_EXPOSURE_SAMPLES * 2)
  let textureSource: HTMLCanvasElement | null = null
  return (ctx: CanvasRenderingContext2D, plate: HTMLCanvasElement, samples: Sample[]) => {
    if (gl.isContextLost()) return false
    if (plate !== textureSource) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plate)
      textureSource = plate
    }
    for (const [i, sample] of samples.entries()) {
      rotations[i * 2] = Math.cos(sample.angle)
      rotations[i * 2 + 1] = Math.sin(sample.angle)
    }
    gl.uniform2fv(angles, rotations, 0, samples.length * 2)
    gl.uniform1i(count, samples.length)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    ctx.drawImage(canvas, 0, 0)
    return true
  }
}

export function drawRotated(ctx: CanvasRenderingContext2D, plate: HTMLCanvasElement, angle: number) {
  const size = ctx.canvas.width
  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.rotate(angle)
  ctx.drawImage(plate, -size / 2, -size / 2, size, size)
  ctx.restore()
}

function createCpuExposure(size: number) {
  const scratch = document.createElement('canvas')
  scratch.width = scratch.height = size
  const buffer = scratch.getContext('2d', { willReadFrequently: true })!
  const sums = new Uint32Array(size * size * 4)
  const output = buffer.createImageData(size, size)
  return (ctx: CanvasRenderingContext2D, plate: HTMLCanvasElement, samples: Sample[]) => {
    sums.fill(0)
    for (const sample of samples) {
      buffer.clearRect(0, 0, size, size)
      drawRotated(buffer, plate, sample.angle)
      const { data } = buffer.getImageData(0, 0, size, size)
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]
        sums[i] += data[i] * alpha
        sums[i + 1] += data[i + 1] * alpha
        sums[i + 2] += data[i + 2] * alpha
        sums[i + 3] += alpha
      }
    }
    for (let i = 0; i < sums.length; i += 4) {
      const alpha = sums[i + 3]
      const divisor = alpha || 1
      output.data[i] = sums[i] / divisor
      output.data[i + 1] = sums[i + 1] / divisor
      output.data[i + 2] = sums[i + 2] / divisor
      output.data[i + 3] = alpha / samples.length
    }
    ctx.putImageData(output, 0, 0)
  }
}

function createIntegrator(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const gpu = createGpuExposure(canvas)
  let cpu: ReturnType<typeof createCpuExposure> | undefined
  return (ctx: CanvasRenderingContext2D, plate: HTMLCanvasElement, samples: Sample[]) => {
    if (gpu?.(ctx, plate, samples)) return
    cpu ??= createCpuExposure(size)
    cpu(ctx, plate, samples)
  }
}
const integrators = new WeakMap<CanvasRenderingContext2D, { size: number; draw: ReturnType<typeof createIntegrator> }>()

export function drawExposure(ctx: CanvasRenderingContext2D, plate: HTMLCanvasElement, samples: Sample[]) {
  const size = ctx.canvas.width
  ctx.clearRect(0, 0, size, size)
  if (samples.length === 1) {
    drawRotated(ctx, plate, samples[0].angle)
    return
  }
  let integrator = integrators.get(ctx)
  if (integrator?.size !== size) {
    integrator = { size, draw: createIntegrator(size) }
    integrators.set(ctx, integrator)
  }
  integrator.draw(ctx, plate, samples)
}
