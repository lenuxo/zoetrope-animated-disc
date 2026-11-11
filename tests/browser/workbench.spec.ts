import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function uploadPlate(page: Page) {
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
  await uploadPlate(page)
  const original = page.getByRole('button', { name: '在原图上点击设置圆心' })
  const bounds = await original.boundingBox()
  expect(bounds!.height).toBeGreaterThanOrEqual(200)
  await page.getByLabel('半径', { exact: true }).fill('550')
  await page.getByRole('button', { name: '应用校准', exact: true }).click()
  await page.getByRole('button', { name: '45', exact: true }).click()
  await page.getByRole('spinbutton', { name: '独立帧数', exact: true }).fill('27')
  await page.getByRole('button', { name: '播放', exact: true }).click()
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
  await uploadPlate(page)
  await page.getByRole('button', { name: '延长曝光' }).click()
  await page.getByRole('button', { name: '下一采样帧' }).click()
  await expect(page.getByTestId('simulation-metrics')).toContainText('积分 48 次')
  for (const id of ['record', 'observation-canvas']) {
    const rgba = await page.getByTestId(id).evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data])
    expect(rgba).toEqual([35, 75, 123, 255])
  }
})

test('rewind and reset use the same historical speed and direction throughout', async ({ page }) => {
  await page.goto('/')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一采样帧' }).click()
  await page.getByRole('button', { name: '45', exact: true }).click()
  await page.getByRole('combobox', { name: '旋转方向' }).click()
  await page.getByRole('option', { name: '逆时针' }).click()
  await page.getByRole('button', { name: '上一采样帧' }).click()
  await page.getByRole('button', { name: '回到起点' }).click()
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 0 @')
  await expect(page.locator('output[for="rotation-speed"]')).toContainText('33⅓ RPM')
  await expect(page.getByRole('combobox', { name: '旋转方向' })).toHaveText('顺时针')
  await expect(page.getByTestId('sync-status')).toContainText('1.000 格')
  await expect(page.locator('.workspace-status')).toContainText('33⅓ RPM · 30 fps')
})

test('the CD reference ring and the camera report the same sampled motion', async ({ page }) => {
  await page.goto('/')
  await page.getByText('多圆环', { exact: true }).click()
  await page.getByText('CD 受控变速', { exact: true }).click()
  await page.getByRole('tab', { name: '采样检查' }).click()
  await page.getByRole('button', { name: '下一采样帧' }).click()
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
  await expect(page.getByRole('spinbutton', { name: '独立帧数' })).toHaveValue('20')
  await expect(page.locator('.workspace-status')).toContainText('45 RPM · 30 fps · 1.00 ms')
  await page.getByRole('button', { name: '78', exact: true }).click()
  await page.goBack()
  await page.goForward()
  await expect(page.locator('.workspace-status')).toContainText('78 RPM')
})

test('observation radius follows numeric input, frame dragging and ring selection', async ({ page }) => {
  await page.goto('/')
  const input = page.getByRole('spinbutton', { name: '观察半径（%）' })
  await input.fill('35')
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
  await page.getByText('多圆环', { exact: true }).click()
  await expect(input).toHaveValue('85')
  await input.fill('30')
  await page.getByRole('button', { name: '观察此圈' }).click()
  await expect(input).toHaveValue('85')
})

test('on narrow screens navigation stays reachable and mode choices work by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
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
  await expect(page.getByTestId('record')).toBeVisible()
  // Count full-size source reads rather than asserting machine-dependent timings.
  await page.evaluate(() => {
    const read = CanvasRenderingContext2D.prototype.getImageData
    let reads = 0
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (args[2] === 1200 && args[3] === 1200) document.body.dataset.sourceReads = String(++reads)
      return read.apply(this, args)
    }
  })
  await page.getByText('多圆环', { exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-source-reads', '3')
  await page.getByRole('switch', { name: '各圈位置与动作帧编号' }).click()
  await page.getByRole('button', { name: '下一采样帧' }).click()
  await expect(page.getByTestId('simulation-metrics')).toContainText('帧 1 @')
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
  await uploadPlate(page)
  await page.getByLabel('半径', { exact: true }).fill('500')
  await page.getByRole('button', { name: '应用校准', exact: true }).click()
  await page.getByRole('button', { name: '轻微失配' }).click()
  await page.getByText('多圆环', { exact: true }).click()
  await page.getByText('CD 受控变速', { exact: true }).click()
  await page.getByRole('link', { name: '设计指南', exact: true }).click()
  await page.getByRole('combobox', { name: '观看组合' }).click()
  await page.getByRole('option', { name: '45 RPM · 30 fps · 40 格' }).click()
  await page.getByRole('button', { name: '用这份参数打开工作台' }).click()
  await expect(page.getByRole('radio', { name: '单盘面' })).toBeChecked()
  await expect(page.getByRole('radio', { name: '恒定转速' })).toBeChecked()
  await expect(page.getByRole('switch', { name: '自动匹配' })).toBeChecked()
  await expect(page.locator('.workbench-main')).toContainText('calibration.png')
  await expect(page.locator('.workspace-status')).toContainText('45 RPM · 30 fps')
  await page.getByRole('button', { name: '转臂与计数', exact: true }).click()
  await page.getByRole('button', { name: '使用已上传图片' }).click()
  await expect(page.getByRole('spinbutton', { name: '半径', exact: true })).toHaveValue('500')
  await expect(page.getByRole('spinbutton', { name: '圆周格数' })).toHaveValue('40')
  await expect(page.getByRole('spinbutton', { name: '独立帧数' })).toHaveValue('10')
  await expect(page.getByRole('spinbutton', { name: '重复次数' })).toHaveValue('4')
})
