// Stop: before finishing, run the quick checks on what changed; a failure sends the agent back to it.
import { existsSync } from 'node:fs'
import { $ } from 'bun'

const input = await Bun.stdin.json()
if (input.stop_hook_active || !existsSync('node_modules') || !existsSync('.generated')) process.exit(0)
const changed = (await $`git status --porcelain`.quiet().text()).trim()
const ahead = (await $`git log --oneline origin/next..HEAD`.nothrow().quiet().text()).trim()
if (!changed && !ahead) process.exit(0)

const result = await $`bun scripts/check-changed.ts`.nothrow().quiet()
if (result.exitCode !== 0) {
  console.error(`bun run check:changed failed; fix these before finishing:\n${result.stdout.toString().slice(-4000)}`)
  process.exit(2)
}
