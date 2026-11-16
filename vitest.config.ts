import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { readdirSync, readFileSync } from 'node:fs'

// Drizzle Kit writes one folder per migration, so read them ourselves in order.
const migrations = readdirSync('migrations').sort().map(name => ({
  name, queries: [readFileSync(`migrations/${name}/migration.sql`, 'utf8')],
}))

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts', 'layers/*/tests/unit/**/*.test.ts'] } },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations } } })],
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts', 'layers/*/tests/integration/**/*.test.ts'], setupFiles: ['./tests/integration/setup.ts'] },
      },
    ],
  },
})
