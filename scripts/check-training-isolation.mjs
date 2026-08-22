#!/usr/bin/env node
// Enforces ADR-0032: training mode writes to its own tables and nothing else.
// The guarantee is meant to be checkable rather than reviewable; this is the check.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TRAINING_API = 'server/api/training'
const TRAINING_UTIL = 'server/utils/trainingRun.ts'

// The only tables a training request may write. Anything else it touches must
// be a read, and the allow-list below says which reads are expected.
const WRITABLE = new Set(['trainingRuns', 'trainingRunEvents'])

// Read-only by design: a trainee learns the real menu at the real prices.
const READABLE = new Set(['barProducts', 'barCategories', 'barDiscounts', 'barPrices'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const files = [...walk(TRAINING_API), TRAINING_UTIL]
const problems = []

for (const file of files) {
  const source = readFileSync(file, 'utf8')

  // Any write against a table that is not one of ours.
  for (const match of source.matchAll(/db\s*\.\s*(insert|update|delete)\s*\(\s*schema\.(\w+)/g)) {
    const [, verb, table] = match
    if (!WRITABLE.has(table)) {
      problems.push(`${file}: ${verb}s schema.${table}, which is not a training table.\n`
        + '  Training mode writes training_runs and training_run_events only (ADR-0032).')
    }
  }

  // A raw statement could write anything, so it is refused outright here.
  if (/db\s*\.\s*run\s*\(/.test(source)) {
    problems.push(`${file}: uses db.run(), which this check cannot read. Use the query builder.`)
  }

  // Reads are allowed, but only from tables somebody decided about.
  for (const match of source.matchAll(/schema\.([a-z]\w+)/g)) {
    const table = match[1]
    if (WRITABLE.has(table) || READABLE.has(table)) continue
    problems.push(`${file}: touches schema.${table}, which is neither a training table nor on the\n`
      + '  read allow-list in this script. If the sandbox genuinely needs to read it, add it\n'
      + '  there with a reason. It must never write it (ADR-0032).')
  }
}

if (problems.length) {
  console.error(`\n${problems.length} training-isolation problem(s):\n`)
  for (const problem of problems) console.error(`  ${problem}\n`)
  process.exit(1)
}

console.log(`check-training-isolation: ${files.length} training files, none touch an operational table.`)
