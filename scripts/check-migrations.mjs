#!/usr/bin/env node
// Enforces ADR-0037: a generated table rebuild silently deletes every row that
// cascades onto the table, because D1 ignores `PRAGMA foreign_keys=OFF`.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'server/db/migrations/sqlite'

// Applied before the rule existed, and both are past correcting. `0047` cost
// four `bar_prices` rows; `0040` was the same hazard over an empty table.
const GRANDFATHERED = new Set(['0040_perfect_umar', '0047_sour_mathemanic'])

const snapshots = readdirSync(join(DIR, 'meta')).filter(f => f.endsWith('_snapshot.json')).sort()
const latest = JSON.parse(readFileSync(join(DIR, 'meta', snapshots.at(-1)), 'utf8'))

// Which tables lose rows when a given table is dropped.
const cascadesOnto = new Map()
for (const table of Object.values(latest.tables ?? {})) {
  for (const fk of Object.values(table.foreignKeys ?? {})) {
    if (fk.onDelete !== 'cascade') continue
    if (!cascadesOnto.has(fk.tableTo)) cascadesOnto.set(fk.tableTo, new Set())
    cascadesOnto.get(fk.tableTo).add(table.name)
  }
}

const problems = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  const tag = file.replace(/\.sql$/, '')
  if (GRANDFATHERED.has(tag)) continue
  const sql = readFileSync(join(DIR, file), 'utf8')
  for (const [, table] of sql.matchAll(/CREATE TABLE `__new_(\w+)`/g)) {
    const dependents = cascadesOnto.get(table)
    if (!dependents?.size) continue
    problems.push(`${file}: rebuilds \`${table}\`, and dropping it cascades to `
      + `${[...dependents].map(t => `\`${t}\``).join(', ')}. Those rows go silently.`)
  }
}

if (problems.length) {
  console.error('check-migrations: a table rebuild would delete rows that cascade onto it.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nD1 runs migrations inside a transaction, where `PRAGMA foreign_keys=OFF` is a')
  console.error('no-op, so Drizzle\'s rebuild does not disable the cascade it assumes it has.')
  console.error('Split the change so no rebuild is needed (add, rename and alter separately),')
  console.error('or hand-author the migration to save and restore the dependent rows.')
  console.error('See docs/decisions/0037-a-table-rebuild-takes-its-dependents-with-it.md')
  process.exit(1)
}

const guarded = [...cascadesOnto.keys()].length
console.log(`check-migrations: ${guarded} tables have rows cascading onto them, none rebuilt.`)
