// Two projects: unit tests in Node, integration tests in workerd with a local D1 (F-34: every tier
// runs locally on Linux). The integration registry is the real one plus the fixture modules in
// tests/fixtures/modules, generated here so tests always see the current manifests.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { kitAliases } from './layers/core/aliases.ts'
import { loadRegistry, ROOTS, FIXTURES, GALLERY } from './scripts/lib/load.ts'
import { writeGenerated } from './scripts/lib/write.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const { modules } = await loadRegistry([...ROOTS.filter(r => r !== GALLERY), FIXTURES, GALLERY])
writeGenerated(modules, { version: '0.0.0-test', registryFile: join(root, '.generated/test-registry.ts'), migrationOwners: ['upstream', 'fixtures'] })

const fixtureRoots = modules.filter(m => m.found.owner === 'fixtures').map(m => join(root, m.found.root))
const alias = { ...kitAliases(root, fixtureRoots), '#test-registry': join(root, '.generated/test-registry.ts') }

export default defineConfig({
  resolve: { alias },
  test: {
    // A ratchet (CONTRIBUTING.md, "Rules as code"): raise these when coverage rises, never lower them.
    // istanbul, because workerd has no V8 coverage; .ts only, as it cannot parse an unloaded .vue.
    coverage: {
      provider: 'istanbul',
      include: ['layers/**/*.ts'],
      exclude: ['**/tests/**', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 85, functions: 81, branches: 70 }, // not-policy: the coverage measured on 24 November 2026
    },
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
          // Coverage instruments every module, which slows the longest flows past the 5 s default.
          testTimeout: 20_000, // not-policy: a test runner limit
          // Off because the pool inlines every cached module into one message, past workerd's 32 MiB limit.
          fsModuleCache: false,
        },
      },
    ],
  },
})
