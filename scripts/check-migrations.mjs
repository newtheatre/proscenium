#!/usr/bin/env node
// Enforces ADR-0037 and ADR-0042: a generated table rebuild silently deletes
// every cascading row, and every schema object the snapshot does not carry.

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

// The table a trigger fires on, read from its body: the name prefix is a
// convention nothing enforces, and the filenames already diverge from it.
const CREATE_TRIGGER = /create\s+trigger\s+(?:if\s+not\s+exists\s+)?`?(\w+)`?\s+(?:before|after|instead\s+of)\s+(?:update(?:\s+of\s+[^]*?)?|delete|insert)\s+on\s+`?(\w+)`?/gi
const DROP_TRIGGER = /drop\s+trigger\s+(?:if\s+exists\s+)?`?(\w+)`?/gi
const REBUILD = /CREATE TABLE `__new_(\w+)`/g
const RENAME = /ALTER TABLE `__new_(\w+)` RENAME TO `\1`/g

/** Every statement this check cares about, in the order the migration runs them. */
function eventsIn(sql) {
  const events = []
  for (const m of sql.matchAll(CREATE_TRIGGER)) events.push({ at: m.index, kind: 'create', name: m[1], table: m[2] })
  for (const m of sql.matchAll(DROP_TRIGGER)) events.push({ at: m.index, kind: 'drop', name: m[1] })
  for (const m of sql.matchAll(REBUILD)) events.push({ at: m.index, kind: 'rebuild', table: m[1] })
  for (const m of sql.matchAll(RENAME)) events.push({ at: m.index, kind: 'rename', table: m[1] })
  return events.sort((a, b) => a.at - b.at)
}

// Triggers live across migrations, so replay the whole directory in order.
const liveTriggers = new Map()
const problems = []

for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(DIR, file), 'utf8')
  const grandfathered = GRANDFATHERED.has(file.replace(/\.sql$/, ''))
  const rebuilt = new Map()

  for (const event of eventsIn(sql)) {
    if (event.kind === 'create') {
      liveTriggers.set(event.name, event.table)
      continue
    }
    if (event.kind === 'drop') {
      liveTriggers.delete(event.name)
      continue
    }
    if (event.kind === 'rebuild') {
      if (grandfathered) continue
      const dependents = cascadesOnto.get(event.table)
      if (dependents?.size) {
        problems.push(`${file}: rebuilds \`${event.table}\`, and dropping it cascades to `
          + `${[...dependents].map(t => `\`${t}\``).join(', ')}. Those rows go silently.`)
      }
      continue
    }
    // `DROP TABLE t` takes the table's triggers with it. Only a CREATE after
    // the rename restores one: an earlier one attaches to the doomed table.
    const lost = [...liveTriggers].filter(([, table]) => table === event.table).map(([name]) => name)
    for (const name of lost) liveTriggers.delete(name)
    if (!grandfathered && lost.length) rebuilt.set(event.table, lost)
  }

  for (const [table, lost] of rebuilt) {
    const dropped = lost.filter(name => liveTriggers.get(name) !== table)
    if (!dropped.length) continue
    problems.push(`${file}: rebuilds \`${table}\`, and dropping it drops its triggers `
      + `${dropped.map(t => `\`${t}\``).join(', ')}, which no snapshot carries and no regenerate re-emits.`)
  }
}

if (problems.length) {
  console.error('check-migrations: a table rebuild would silently drop something.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nD1 runs migrations inside a transaction, where `PRAGMA foreign_keys=OFF` is a')
  console.error('no-op, so Drizzle\'s rebuild does not disable the cascade it assumes it has.')
  console.error('A rebuild is `DROP TABLE` plus a rename, so it also takes every schema object')
  console.error('the Drizzle snapshot does not carry: today that means triggers, and Drizzle')
  console.error('cannot re-emit what it has never seen.')
  console.error('Split the change so no rebuild is needed (add, rename and alter separately),')
  console.error('or hand-author the migration to save and restore what the drop would take,')
  console.error('re-creating any trigger AFTER the `ALTER TABLE __new_… RENAME TO …`.')
  console.error('See docs/decisions/0037-a-table-rebuild-takes-its-dependents-with-it.md')
  console.error('and docs/decisions/0042-a-rebuild-also-drops-what-the-snapshot-cannot-see.md')
  process.exit(1)
}

const guarded = [...cascadesOnto.keys()].length
console.log(`check-migrations: ${guarded} tables have rows cascading onto them and `
  + `${liveTriggers.size} triggers are live, none dropped by a rebuild.`)
