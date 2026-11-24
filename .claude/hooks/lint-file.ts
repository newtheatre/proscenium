// PostToolUse on Edit and Write: fix what ESLint can in the edited file and report what is left.
import { existsSync } from 'node:fs'
import { $ } from 'bun'

const input = await Bun.stdin.json()
const path: string | undefined = input.tool_input?.file_path
if (!path || !/\.(ts|vue|mjs)$/.test(path) || !existsSync(path) || !existsSync('.nuxt/eslint.config.mjs')) process.exit(0)

const result = await $`bunx eslint --fix --cache --cache-location node_modules/.cache/eslint --pass-on-unpruned-suppressions ${path}`.nothrow().quiet()
if (result.exitCode !== 0) {
  console.error(`ESLint found problems it cannot fix in ${path}:\n${result.stdout.toString()}`)
  process.exit(2)
}
