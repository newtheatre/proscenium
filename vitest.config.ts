// Two projects: unit tests in Node, integration tests in workerd with a local D1 (F-34: every tier
// runs locally on Linux). The integration registry is the real one plus the fixture modules in
// tests/fixtures/modules, generated here so tests always see the current manifests.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { kitAliases } from './layers/core/aliases.ts'
import { loadRegistry, ROOTS, FIXTURES } from './scripts/lib/load.ts'
import { writeGenerated } from './scripts/lib/write.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const { modules } = await loadRegistry([...ROOTS, FIXTURES])
writeGenerated(modules, { version: '0.0.0-test', registryFile: join(root, '.generated/test-registry.ts'), migrationOwners: ['upstream', 'fixtures'] })

const fixtureRoots = modules.filter(m => m.found.owner === 'fixtures').map(m => join(root, m.found.root))
const alias = { ...kitAliases(root, fixtureRoots), '#test-registry': join(root, '.generated/test-registry.ts') }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts', 'layers/*/tests/unit/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'layers/*/tests/integration/**/*.test.ts'],
          setupFiles: ['./tests/integration/setup.ts'],
        },
      },
    ],
  },
})
