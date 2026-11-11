import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4185'
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL, viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4185 --strictPort',
    url: baseURL,
  },
})
