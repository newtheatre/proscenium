// Browser tests run against the built Worker under wrangler (workerd), as it runs on Cloudflare.
// `bun run test:browser` builds first. Local state is separate from `bun run preview`'s.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  // One worker: the tests share one local database, and a setting one test changes is another's default.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:8788' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'rm -rf .wrangler/e2e && bunx wrangler dev --cwd .output --port 8788 --persist-to ../.wrangler/e2e --var PROSCENIUM_AUTO_MIGRATE:1 --var CORE_ENCRYPTION_KEY:browser-tests-only-not-a-secret --var CORE_SESSION_KEY:browser-tests-only-not-a-secret',
    url: 'http://localhost:8788/api/core/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
