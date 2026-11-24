// PreToolUse on Bash: refuse commands the project's rules forbid outright.
const input = await Bun.stdin.json()
const command: string = input.tool_input?.command ?? ''

const rules: [RegExp, string][] = [
  [/(^|[\s;&|(])(npm|npx|pnpm|yarn)(\s|$)/, 'this repository uses Bun only: bun install, bun run, bunx'],
  [/wrangler\s+(deploy|publish|versions\s+deploy|secret\s+put)/, 'deploys and secrets are never done from a working copy; Workers Builds deploys, people decide when'],
  [/wrangler\s+d1\s+(execute|migrations\s+apply)\b.*--remote/, 'never write to a remote D1 database from a working copy'],
  [/git\s+push\s+.*(--force|-f)(\s|$).*\b(next|main|nnt)\b|git\s+push\s+.*\b(next|main|nnt)\b.*(--force|-f)(\s|$)/, 'never force-push a shared branch'],
]
for (const [pattern, why] of rules) {
  if (pattern.test(command)) {
    console.error(`Refused: ${why}.`)
    process.exit(2)
  }
}
