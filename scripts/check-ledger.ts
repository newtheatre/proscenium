#!/usr/bin/env bun
// One writer of the ledger (0004, I-102 criterion 6). A module that takes money without posting
// is a defect by definition, and the way to keep that true is to leave one door in.

import { join } from 'node:path'

// The one file allowed to build a ledger insert, and the one place the rules live.
const WRITER = 'server/utils/ledger.ts'

// Naming the table beats matching spellings: drizzle's schema.ledgerEntries and a raw
// `INSERT INTO ledger_entries` are the same act.
const TABLE = /\b(?:ledger_entries|ledger_lines|ledgerEntries|ledgerLines)\b/
const READS = /\b(?:select|count|sum|from)\b/i

// server/db declares the tables, and migration/ is standalone tooling the application never
// imports. Neither runs in a request.
function serverFiles(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: 'server', onlyFiles: true })]
    .map(path => join('server', path))
    .filter(path => path !== WRITER && !path.startsWith(join('server', 'db')))
    .sort()
}

const problems: string[] = []

for (const file of serverFiles()) {
  const source = await Bun.file(file).text()

  source.split('\n').forEach((line, index) => {
    if (!TABLE.test(line)) return
    // A report reads the ledger; that is the point of it. Only writing is restricted.
    const writes = /\b(?:insert|update|delete)\b/i.test(line) && !READS.test(line)
    if (writes) problems.push(`${file}:${index + 1}  writes to the ledger`)
  })
}

// Scripts are outside a request and can still reach the database (0027).
// This file included would match its own pattern, which is a checker reporting itself.
const SELF = 'check-ledger.ts'

for (const file of [...new Bun.Glob('*.ts').scanSync({ cwd: 'scripts', onlyFiles: true })].sort()) {
  if (file === SELF) continue
  const source = await Bun.file(join('scripts', file)).text()
  if (/INSERT\s+INTO\s+ledger_(entries|lines)/i.test(source)) {
    problems.push(`scripts/${file}  writes to the ledger directly`)
  }
}

if (problems.length) {
  console.error('check-ledger: only server/utils/ledger.ts may post to the ledger.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(`
Money and the thing it paid for commit in one batch (0001). postEntry returns the
statements so a caller can do that; it does not write them itself. A path that takes
money without posting an entry is a defect by definition (0004).`)
  process.exit(1)
}

console.info(`check-ledger: ${serverFiles().length} server files checked, only ${WRITER} posts.`)
