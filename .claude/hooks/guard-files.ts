// PreToolUse on Edit and Write: refuse files that are generated, vendored or already released.
import { existsSync } from 'node:fs'
import { relative } from 'node:path'

const input = await Bun.stdin.json()
const path: string | undefined = input.tool_input?.file_path
if (!path) process.exit(0)
const file = relative(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), path)

const refuse = (why: string) => {
  console.error(`${file}: ${why}`)
  process.exit(2)
}
if (/^(\.generated|\.nuxt|\.output|node_modules)\//.test(file)) refuse('generated or installed; change the manifest or schema and run `bun run generate` instead')
if (/^(site\/)?migrations\//.test(file) && existsSync(path)) refuse('an existing migration is never edited; change the schema and run `bun run db:generate -- --name <what>`')
if (/(^|\/)bun\.lock$/.test(file)) refuse('the lockfile is written by `bun install` and `bun add`, never by hand')
