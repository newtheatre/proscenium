#!/usr/bin/env bun
// The six invariant checkers behind one command. Every one runs, so a developer sees all the
// failures at once rather than the first; the summary and the exit code name which failed.

interface Check {
  name: string
  script: string
  // Why the invariant exists, kept beside the check rather than in the workflow that calls it.
  describes: string
}

export const CHECKS: Check[] = [
  {
    name: 'comments',
    script: 'scripts/check-comments.ts',
    describes: 'Two lines maximum, constraints not narration, no JSDoc block tags, no narrated history.',
  },
  {
    name: 'migrations',
    script: 'scripts/check-migrations.ts',
    describes: 'A generated rebuild of an append-only table, or one dropping a cascade or trigger the snapshot cannot re-emit (0010).',
  },
  {
    name: 'content-tokens',
    script: 'scripts/check-content-tokens.ts',
    describes: 'A policy page quoting a key the schema does not have, or one that holds personal data (0012, 0011).',
  },
  {
    name: 'ledger',
    script: 'scripts/check-ledger.ts',
    describes: 'A money path that writes the ledger itself is a path that can forget to (0004).',
  },
  {
    name: 'notifications',
    script: 'scripts/check-notifications.ts',
    describes: 'Anything but the notification centre reaching the mail binding skips every rule the centre enforces (0013).',
  },
  {
    name: 'audit',
    script: 'scripts/check-audit.ts',
    describes: 'A privileged mutation that records nothing is a gap nobody sees until it matters (J-101 criterion 5).',
  },
]

// An annotation is surfaced at the top of a run rather than buried in a step's log, so collapsing
// six steps into one makes a failure more visible rather than less.
const ANNOTATE = Boolean(process.env.GITHUB_ACTIONS)

function annotate(check: Check): void {
  if (!ANNOTATE) return
  console.info(`::error title=check ${check.name}::${check.describes}`)
}

async function run(check: Check): Promise<boolean> {
  const started = Date.now()
  const spawned = Bun.spawn(['bun', check.script], { stdout: 'pipe', stderr: 'pipe' })
  const [out, error, code] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ])

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.info(`\n${code === 0 ? 'ok  ' : 'FAIL'}  check ${check.name}  (${seconds}s)`)
  for (const line of `${out}${error}`.trimEnd().split('\n')) {
    if (line.trim()) console.info(`      ${line}`)
  }
  if (code !== 0) annotate(check)
  return code === 0
}

const wanted = process.argv.slice(2)
const unknown = wanted.filter(name => !CHECKS.some(check => check.name === name))

if (unknown.length) {
  console.error(`check: no such check ${unknown.join(', ')}`)
  console.error(`Known: ${CHECKS.map(check => check.name).join(', ')}`)
  process.exit(1)
}

const selected = wanted.length ? CHECKS.filter(check => wanted.includes(check.name)) : CHECKS

const failed: string[] = []
for (const check of selected) {
  if (!await run(check)) failed.push(check.name)
}

if (failed.length) {
  console.error(`\ncheck: ${failed.length} of ${selected.length} failed: ${failed.join(', ')}`)
  console.error(`Run one on its own with \`bun run check ${failed[0]}\`.`)
  process.exit(1)
}

console.info(`\ncheck: ${selected.length} checks passed.`)
