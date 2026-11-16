// Browser tests run against the built Worker under wrangler (workerd), as it runs on Cloudflare.
// `bun run test:browser` builds first. Local state is separate from `bun run preview`'s.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:8788' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx wrangler dev --cwd .output --port 8788 --persist-to ../.wrangler/e2e --var PROSCENIUM_AUTO_MIGRATE:1',
    url: 'http://localhost:8788/api/core/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
