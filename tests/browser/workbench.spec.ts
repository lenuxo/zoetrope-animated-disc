import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openView(page: Page, name: string) {
  if (name === '转速与相机' || name === '素材与圆环') {
    await openView(page, '全景')
    await page.getByRole('button', { name: name === '转速与相机' ? '运动参数' : '素材与结构', exact: true }).click()
    if (name === '转速与相机') {
      const settings = page.getByRole('button', { name: '相机设置', exact: true })
      if (await settings.getAttribute('aria-expanded') !== 'true') await settings.click()
    }
  } else await page.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('.workbench')).not.toHaveAttribute('data-camera-moving', 'true')
}
async function operate(page: Page, label: string) {
  const previous = await page.locator('.workbench').getAttribute('data-view')
  await openView(page, '全景')
  const hideCamera = page.getByRole('button', { name: '隐藏相机视野', exact: true })
  const cameraVisible = await hideCamera.isVisible()
  if (cameraVisible) await hideCamera.click()
  await page.getByRole('group', { name: '唱机实体按键' }).getByRole('button', { name: label, exact: true }).click()
  if (cameraVisible) await page.getByRole('button', { name: '显示相机视野', exact: true }).click()
  const views: Record<string, string> = { overview: '全景', disc: '盘面俯视', monitor: '观察特写' }
  if (previous && previous !== 'overview') await openView(page, views[previous])
}
async function uploadPlate(page: Page) {
  await openView(page, '素材与圆环')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1200
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(35,75,123)'
    ctx.fillRect(0, 0, 1200, 1200)
    return canvas.toDataURL().split(',')[1]
  })
  await page.locator('#single-editor input[type=file]').setInputFiles({
    name: 'calibration.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  })
  await expect(page.locator('.workbench-main')).toContainText('calibration.png')
}

test('calibration, bitmap, drafts and paused playback survive guide round trips', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await uploadPlate(page)
  const original = page.getByRole('button', { name: '在原图上点击设置圆心' })
  const bounds = await original.boundingBox()
  expect(bounds!.height).toBeGreaterThanOrEqual(200)
  await page.getByLabel('半径', { exact: true }).fill('550')
  await page.getByRole('button', { name: '应用校准', exact: true }).click()
  await openView(page, '转速与相机')
  await page.getByRole('button', { name: '45', exact: true }).click()
  await openView(page, '素材与圆环')
  await page.getByRole('spinbutton', { name: '独立帧数', exact: true }).fill('27')
  await operate(page, '播放')
  await expect(page.getByTestId('simulation-metrics')).not.toContainText('帧 0 @')
  await page.getByRole('link', { name: '设计指南', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('第一张')
  await page.goBack()
  await expect(page.locator('.workbench-main')).toContainText('calibration.png')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '独立帧数', exact: true })).toHaveValue('27')
  await expect(page.getByLabel('半径', { exact: true })).toHaveValue('550')
  await expect(page.locator('.workspace-status')).toContainText('45 RPM')
  const pixel = await page.getByTestId('record').evaluate((el: HTMLCanvasElement) => [...el.getContext('2d')!.getImageData(512, 512, 1, 1).data])
  expect(pixel).toEqual([35, 75, 123, 255])
})

test('a full shutter preserves color and opacity in the workbench and its crop', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await uploadPlate(page)
  await openView(page, '转速与相机')
  await page.getByRole('button', { name: '延长曝光' }).click()
  await operate(page, '下一采样帧')
  await expect(page.getByTestId('simulation-metrics')).toContainText('积分 48 次')
  for (const id of ['record', 'observation-canvas']) {
    const rgba = await page.getByTestId(id).evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data])
    expect(rgba).toEqual([35, 75, 123, 255])
  }
})

test('rewind and reset use the same historical speed and direction throughout', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  for (let i = 0; i < 3; i++) await operate(page, '下一采样帧')
  await page.getByRole('button', { name: '45', exact: true }).click()
  await page.getByRole('combobox', { name: '旋转方向' }).click()
  await page.getByRole('option', { name: '逆时针' }).click()
  await operate(page, '上一采样帧')
  await operate(page, '复位')
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 0 @')
  await expect(page.locator('output[for="rotation-speed"]')).toContainText('33⅓ RPM')
  await expect(page.getByRole('combobox', { name: '旋转方向' })).toHaveText('顺时针')
  await expect(page.getByTestId('sync-status')).toContainText('1.000 格')
  await expect(page.locator('.workspace-status')).toContainText('33⅓ RPM · 30 fps')
})

test('the CD reference ring and the camera report the same sampled motion', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await openView(page, '素材与圆环')
  await page.getByText('多圆环', { exact: true }).click()
  await openView(page, '转速与相机')
  await page.getByText('CD 受控变速', { exact: true }).click()
  await openView(page, '素材与圆环')
  await page.getByRole('tab', { name: '采样检查' }).click()
  await operate(page, '下一采样帧')
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 1 @')
  await expect(page.getByTestId('sync-status')).toContainText('近似逐格同步')
  await expect(page.getByRole('tabpanel', { name: '采样检查' })).toContainText('本圈近似逐格同步')
})

test('changing a guide plan reopens downstream checks and transfers settings once', async ({ page }) => {
  await page.goto('/design-guide')
  await expect(page.locator('.guide-checkpoint input')).toHaveCount(6)
  for (const box of await page.locator('.guide-checkpoint input').all()) await box.check()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '6')
  await page.getByRole('combobox', { name: '观看组合' }).click()
  await page.getByRole('option', { name: '45 RPM · 30 fps · 40 格' }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await page.getByRole('combobox', { name: '每个循环的独立帧数' }).click()
  await page.getByRole('option', { name: '20 帧', exact: true }).click()
  await expect(page.locator('#verify .guide-demo-heading')).toContainText('40 格 · 20 帧 × 2')
  await page.getByRole('button', { name: '用这份参数打开工作台' }).click()
  await expect(page.locator('.workbench-main')).toContainText('40 格 / 20 帧 × 2')
  await openView(page, '素材与圆环')
  await expect(page.getByRole('spinbutton', { name: '独立帧数' })).toHaveValue('20')
  await expect(page.locator('.workspace-status')).toContainText('45 RPM · 30 fps · 1.00 ms')
  await openView(page, '转速与相机')
  await page.getByRole('button', { name: '78', exact: true }).click()
  await page.goBack()
  await page.goForward()
  await expect(page.locator('.workspace-status')).toContainText('78 RPM')
})

test('observation radius follows numeric input, frame dragging and ring selection', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await page.getByRole('button', { name: '检查工具', exact: true }).click()
  const input = page.locator('#observation-radius')
  await input.fill('35')
  await openView(page, '盘面俯视')
  await page.getByRole('button', { name: '隐藏相机视野', exact: true }).click()
  const window = page.getByTestId('observation-window')
  const top = await window.evaluate(el => el.getBoundingClientRect().top)
  const handle = page.getByRole('button', { name: '沿半径移动观察窗' })
  await handle.focus()
  await handle.press('ArrowUp')
  await expect(input).toHaveValue('36')
  expect(await window.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(top)
  const bounds = (await handle.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 20, { steps: 4 })
  await page.mouse.up()
  expect(Number(await input.inputValue())).toBeLessThan(36)
  await openView(page, '素材与圆环')
  await page.getByText('多圆环', { exact: true }).click()
  await expect(input).toHaveValue('85')
  await page.getByRole('button', { name: '检查工具', exact: true }).click()
  await input.fill('30')
  await openView(page, '素材与圆环')
  await page.getByRole('button', { name: '观察此圈' }).click()
  await expect(input).toHaveValue('85')
})

test('on narrow screens navigation stays reachable and mode choices work by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await openView(page, '转速与相机')
  const guide = page.getByRole('link', { name: '设计指南', exact: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(guide).toBeInViewport({ ratio: 1 })
  }
  await page.getByRole('radio', { name: '恒定转速' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'CD 受控变速' })).toBeChecked()
  await guide.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('第一张')
})

test('renaming preserves the playhead and guides reuse projected ring pixels', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await expect(page.getByTestId('turntable')).toBeVisible()
  // Count full-size source reads rather than asserting machine-dependent timings.
  await page.evaluate(() => {
    const read = CanvasRenderingContext2D.prototype.getImageData
    let reads = 0
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (args[2] === 1200 && args[3] === 1200) document.body.dataset.sourceReads = String(++reads)
      return read.apply(this, args)
    }
  })
  await openView(page, '素材与圆环')
  await page.getByText('多圆环', { exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-source-reads', '3')
  await page.getByRole('button', { name: '检查工具', exact: true }).click()
  await page.getByRole('switch', { name: '各圈位置与动作帧编号' }).click()
  await operate(page, '下一采样帧')
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 1 @')
  await openView(page, '素材与圆环')
  const ring = page.getByRole('region', { name: '外圈圆环' })
  await ring.getByText('管理此圈').click()
  await ring.getByRole('textbox', { name: '圆环名称' }).fill('弹跳外圈')
  await ring.getByRole('button', { name: '重命名' }).click()
  await expect(page.getByRole('region', { name: '弹跳外圈圆环' })).toBeVisible()
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 1 @')
  await expect(page.locator('body')).toHaveAttribute('data-source-reads', '3')
  await page.getByRole('tab', { name: '位置映射' }).click()
  await page.getByRole('spinbutton', { name: '相位偏移（°）' }).fill('10')
  await page.getByRole('button', { name: '应用位置' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-source-reads', '4')
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 0 @')
})

test('applying a guide plan to an existing project retains the original calibrated bitmap', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  await uploadPlate(page)
  await page.getByLabel('半径', { exact: true }).fill('500')
  await page.getByRole('button', { name: '应用校准', exact: true }).click()
  await openView(page, '转速与相机')
  await page.getByRole('button', { name: '轻微失配' }).click()
  await openView(page, '素材与圆环')
  await page.getByText('多圆环', { exact: true }).click()
  await openView(page, '转速与相机')
  await page.getByText('CD 受控变速', { exact: true }).click()
  await page.getByRole('link', { name: '设计指南', exact: true }).click()
  await page.getByRole('combobox', { name: '观看组合' }).click()
  await page.getByRole('option', { name: '45 RPM · 30 fps · 40 格' }).click()
  await page.getByRole('button', { name: '用这份参数打开工作台' }).click()
  await openView(page, '素材与圆环')
  await expect(page.getByRole('radio', { name: '单盘面' })).toBeChecked()
  await openView(page, '转速与相机')
  await expect(page.getByRole('radio', { name: '恒定转速' })).toBeChecked()
  await expect(page.getByRole('switch', { name: '自动匹配' })).toBeChecked()
  await expect(page.locator('.workbench-main')).toContainText('calibration.png')
  await expect(page.locator('.workspace-status')).toContainText('45 RPM · 30 fps')
  await openView(page, '素材与圆环')
  await page.getByRole('button', { name: '计数', exact: true }).click()
  await page.getByRole('button', { name: '使用已上传图片' }).click()
  await expect(page.getByRole('spinbutton', { name: '半径', exact: true })).toHaveValue('500')
  await expect(page.getByRole('spinbutton', { name: '圆周格数' })).toHaveValue('40')
  await expect(page.getByRole('spinbutton', { name: '独立帧数' })).toHaveValue('10')
  await expect(page.getByRole('spinbutton', { name: '重复次数' })).toHaveValue('4')
})

test('the spatial monitor and projected operator controls share the transport', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  const scene = page.getByTestId('turntable')
  await expect(scene).toBeVisible()
  const nonEmpty = () => page.getByTestId('observation-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    return pixels.some((value, index) => index % 4 === 3 && value > 0)
  })
  await expect.poll(nonEmpty).toBe(true)
  await expect.poll(() => scene.evaluate((canvas: HTMLCanvasElement) => !!canvas.getContext('webgl2'))).toBe(true)
  await operate(page, '播放')
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled()
  await operate(page, '暂停')
  await openView(page, '盘面俯视')
  await expect(page.getByTestId('record')).toBeVisible()
  await openView(page, '全景')
  await expect(scene).toBeVisible()
})

test('preset views keep their composition, accept a dropped plate and preserve a usable fallback', async ({ page }) => {
  await page.goto('/')
  const workbench = page.locator('.workbench')
  await expect(workbench).toHaveAttribute('data-scene-ready', 'true')
  await expect(page.getByRole('navigation', { name: '仪器视角' }).getByRole('button')).toHaveText(['全景', '盘面俯视', '观察特写'])
  const readout = page.locator('.workbench-sidebar .workspace-status')
  await expect(readout).toBeVisible()
  await expect(page.getByTestId('simulation-metrics')).not.toBeVisible()
  await readout.getByText('采样详情', { exact: true }).click()
  await expect(page.getByTestId('simulation-metrics')).toBeVisible()
  await readout.getByText('采样详情', { exact: true }).click()
  const monitor = page.locator('.spatial-monitor')
  const transform = await monitor.evaluate(element => element.style.transform)
  const scene = page.getByTestId('turntable')
  const bounds = (await scene.boundingBox())!
  await page.mouse.move(bounds.x + 35, bounds.y + 140)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 110, bounds.y + 165, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => monitor.evaluate(element => element.style.transform)).toBe(transform)
  await openView(page, '转速与相机')
  await openView(page, '全景')
  await expect.poll(() => monitor.evaluate(element => element.style.transform)).toBe(transform)
  await expect(page.getByRole('heading', { name: '唱片运动', exact: true })).toBeVisible()
  await expect(page.locator('.workbench-sidebar')).toBeVisible()
  await expect(page.locator('.spatial-speed [role="slider"]')).toHaveCount(0)
  await expect(page.locator('.spatial-speed button')).toHaveCount(0)
  await page.getByRole('button', { name: '45', exact: true }).click()
  await expect(page.locator('.workspace-status')).toContainText('45 RPM')

  const transfer = await page.evaluateHandle(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#345978'
    ctx.fillRect(0, 0, 256, 256)
    const bytes = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), character => character.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'spatial-drop.png', { type: 'image/png' }))
    return data
  })
  await scene.dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await expect(page.locator('.workbench-main')).toContainText('spatial-drop.png')
  await expect(workbench).toHaveAttribute('data-inspector', 'material')
  await expect(workbench).not.toHaveAttribute('data-camera-moving', 'true')
  await openView(page, '观察特写')
  await operate(page, '播放')
  await expect(page.getByTestId('simulation-metrics')).not.toContainText('帧 0 @')
  await operate(page, '暂停')
  await openView(page, '全景')
  await scene.evaluate((canvas: HTMLCanvasElement) => canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext())
  await expect(workbench).toHaveAttribute('data-scene-error', 'true')
  await expect(page.getByTestId('record')).toBeVisible()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
})

test('the chassis readout follows the actual sampled motor speed', async ({ page }) => {
  await page.goto('/')
  const scene = page.getByTestId('turntable')
  await expect(scene).toHaveAttribute('aria-description', '机身转速显示 33.33 RPM')
  await expect(page.locator('.spatial-speed')).toHaveCount(0)
  await page.getByRole('button', { name: '45', exact: true }).click()
  await expect(scene).toHaveAttribute('aria-description', '机身转速显示 45.00 RPM')
  await openView(page, '转速与相机')
  await page.getByText('CD 受控变速', { exact: true }).click()
  await expect(scene).toHaveAttribute('aria-description', '机身转速显示 458.37 RPM')
  await operate(page, '下一采样帧')
  await expect.poll(async () => {
    const description = await scene.getAttribute('aria-description')
    return Number(description?.match(/[\d.]+/)?.[0])
  }).toBeLessThan(458.37)
})

test('physical keys control playback, stepping and reset through mouse and keyboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workbench')).toHaveAttribute('data-scene-ready', 'true')
  await expect(page.locator('.workspace-transport,.operator-playback,.monitor-transport')).toHaveCount(0)
  await expect(page.getByRole('group', { name: '唱机实体按键' }).getByRole('button')).toHaveCount(4)
  await openView(page, '全景')
  const toggle = page.locator('.machine-transport button[data-action="play"]')
  const nearKey = (await page.getByRole('group', { name: '唱机实体按键' }).getByRole('button', { name: '复位', exact: true }).boundingBox())!
  const farKey = (await toggle.boundingBox())!
  expect(nearKey.width).toBeGreaterThan(farKey.width * 1.02)
  const perspectiveTerms = await page.locator('.machine-transport').evaluate(element => {
    const matrix = new DOMMatrix(element.style.transform)
    return Math.abs(matrix.m14) + Math.abs(matrix.m24)
  })
  expect(perspectiveTerms).toBeGreaterThan(0.000001)
  const next = page.getByRole('button', { name: '下一采样帧', exact: true })
  await expect(toggle).toHaveAccessibleName('播放')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('暂停')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(next).toBeDisabled()
  await expect(page.getByTestId('simulation-metrics')).not.toContainText('帧 0 @')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('播放')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(next).toBeEnabled()
  await page.getByRole('group', { name: '唱机实体按键' }).getByRole('button', { name: '复位', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 0 @')
  await next.click()
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 1 @')
  await page.getByRole('button', { name: '上一采样帧', exact: true }).click()
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 0 @')
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAccessibleName('暂停')
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAccessibleName('播放')
})

test('camera frame rate and exposure affect only the observation window', async ({ page }) => {
  await page.goto('/')
  await openView(page, '转速与相机')
  const disc = page.getByTestId('record')
  const monitor = page.getByTestId('observation-canvas')
  await operate(page, '下一采样帧')
  const discBefore = await disc.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  const monitorBefore = await monitor.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await page.getByRole('button', { name: '延长曝光', exact: true }).click()
  await expect.poll(async () => await monitor.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()) !== monitorBefore).toBe(true)
  expect(await disc.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(discBefore)

  await page.getByRole('switch', { name: '自动匹配', exact: true }).click()
  await page.getByRole('spinbutton', { name: '采样率', exact: true }).fill('0.1')
  await page.getByRole('combobox', { name: '曝光时间', exact: true }).click()
  await page.getByRole('option', { name: '1/1000 秒', exact: true }).click()
  await operate(page, '播放')
  const frames = await page.evaluate(async () => {
    const disc = document.querySelector<HTMLCanvasElement>('[data-testid="record"]')!
    const monitor = document.querySelector<HTMLCanvasElement>('[data-testid="observation-canvas"]')!
    const thumbnail = document.createElement('canvas')
    thumbnail.width = thumbnail.height = 64
    const ctx = thumbnail.getContext('2d')!
    const fingerprint = (source: HTMLCanvasElement) => {
      ctx.clearRect(0, 0, 64, 64)
      ctx.drawImage(source, 0, 0, 64, 64)
      return thumbnail.toDataURL()
    }
    const frames: { disc: string; monitor: string }[] = []
    for (let i = 0; i < 12; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      frames.push({ disc: fingerprint(disc), monitor: fingerprint(monitor) })
    }
    return {
      discFrames: new Set(frames.map(frame => frame.disc)).size,
      monitorFrames: new Set(frames.map(frame => frame.monitor)).size,
    }
  })
  expect(frames.discFrames).toBeGreaterThan(4)
  expect(frames.monitorFrames).toBe(1)
  await operate(page, '暂停')
  const paused = await disc.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await operate(page, '下一采样帧')
  expect(await disc.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(paused)
})
