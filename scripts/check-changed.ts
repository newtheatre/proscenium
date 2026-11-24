// bun run check:changed [base]: the quick loop for one change. Lints the files changed against
// origin/next (or base), runs the unit tests related to them, then the conformance checks.
import { existsSync } from 'node:fs'
import { $ } from 'bun'

const base = process.argv[2] ?? 'origin/next'
const committed = await $`git diff --name-only --diff-filter=d ${base}...HEAD`.nothrow().quiet().text()
const working = await $`git diff --name-only --diff-filter=d HEAD`.quiet().text()
const untracked = await $`git ls-files --others --exclude-standard`.quiet().text()
const files = [...new Set([committed, working, untracked].join('\n').split('\n').filter(Boolean))]
const code = files.filter(f => /\.(ts|vue|mjs)$/.test(f) && !f.startsWith('.generated/') && existsSync(f))

let failed = false
if (code.length) {
  console.log(`Lint: ${code.length} changed file(s)`)
  failed ||= (await $`bunx eslint --cache --cache-location node_modules/.cache/eslint ${code}`.nothrow()).exitCode !== 0
  const sources = code.filter(f => !f.endsWith('.mjs'))
  console.log('Unit tests related to the changed files')
  failed ||= (await $`bunx vitest related --run --project unit --passWithNoTests ${sources}`.nothrow()).exitCode !== 0
}
else console.log('No changed code files')

failed ||= (await $`bun run check:conformance`.nothrow()).exitCode !== 0
if (failed) {
  console.log('\ncheck:changed found problems; fix them before pushing. Run `bun run check` for the whole repo.')
  process.exit(1)
}
