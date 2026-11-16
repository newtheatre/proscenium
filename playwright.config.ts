import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:8787' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'bunx wrangler dev --cwd .output --port 8787 --persist-to ../.wrangler/state', url: 'http://localhost:8787/api/core/health', reuseExistingServer: true, timeout: 120_000 },
})
