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

// The pages that serve both modes. Every operational path they fetch must go
// through api(), or the sandbox quietly reads and writes the real thing.
const DUAL_MODE_PAGES = [
  'app/pages/foh/bar/till.vue',
  'app/pages/foh/age-checks.vue',
  'app/pages/foh/scan.vue',
]

const OPERATIONAL_LITERAL = /(['"`])(\/api\/(?:bar|foh)\/[^'"`]*)\1/g

// Nothing is exempt: an unsandboxed route still goes through api(), so in
// practice mode it 404s rather than reaching real data.
const NO_SANDBOX = new Set([])

for (const page of DUAL_MODE_PAGES) {
  const source = readFileSync(page, 'utf8')
  for (const line of source.split('\n')) {
    // Only a fetch matters; a route string in a comment or a link does not.
    if (!/\$fetch|requestFetch|useFetch|useAsyncData/.test(line)) continue
    for (const [, , route] of line.matchAll(OPERATIONAL_LITERAL)) {
      if (line.includes('api(')) continue
      if (NO_SANDBOX.has(route)) continue
      problems.push(`${page}: fetches ${route} without api().\n`
        + '  On a dual-mode page every operational path must be wrapped so practice mode\n'
        + '  retargets it, or the sandbox reaches real data (ADR-0032).')
    }
  }
}

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

  // Raw SQL carries anything and is unreadable here. A batch is readable only
  // because every statement in these files is inline, which the scan below sees.
  if (/db\s*\.\s*(run|execute)\s*\(/.test(source)) {
    problems.push(`${file}: uses raw SQL, which this check cannot read. Use the query builder.`)
  }

  // A route has no reason to batch: only trainingRun.ts writes the run itself.
  if (file !== TRAINING_UTIL && /db\s*\.\s*batch\s*\(/.test(source)) {
    problems.push(`${file}: uses db.batch(). Only ${TRAINING_UTIL} writes the training tables directly.`)
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
