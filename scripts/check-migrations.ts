#!/usr/bin/env bun
// A generated table rebuild silently deletes every cascading row, drops every schema object the
// snapshot does not carry, and can corrupt an added column. Refusing one is 0010 and 0052.

import { join } from 'node:path'
import {
  copyingInserts,
  dependentsByTable,
  journalProblems,
  rebuildDependentProblems,
  snapshotBefore,
  snapshotChainProblems,
  unresolvedCopyProblems,
} from '../shared/utils/migrations'
import type { JournalEntry, SnapshotTable } from '../shared/utils/migrations'

const DIR = 'server/db/migrations/sqlite'
const META = join(DIR, 'meta')

// The estate carried two rebuilds applied before the rule existed. This schema starts clean,
// so a rebuild here is always a defect.
const GRANDFATHERED = new Set<string>()

function scan(dir: string, pattern: string): string[] {
  try {
    return [...new Bun.Glob(pattern).scanSync({ cwd: dir, onlyFiles: true })].sort()
  }
  catch {
    // A directory that does not exist yet is an empty one, not a failure.
    return []
  }
}

const snapshotFiles = scan(META, '*_snapshot.json')
const newest = snapshotFiles.at(-1)
if (!newest) {
  console.log('check-migrations: no snapshots generated yet, nothing to check.')
  process.exit(0)
}

interface Snapshot { tables?: Record<string, SnapshotTable>, id?: string, prevId?: string }

// Every snapshot, numbered, so a rebuild can be checked against the schema as it stood right
// before it ran rather than only against the newest one.
const snapshots = await Promise.all(snapshotFiles.map(async (file) => {
  const data: Snapshot = await Bun.file(join(META, file)).json()
  return { number: Number(file.slice(0, 4)), file, data }
}))

const chainProblems = snapshotChainProblems(snapshots.map(s => ({
  file: s.file,
  id: s.data.id ?? '',
  prevId: s.data.prevId ?? '',
})))

if (chainProblems.length) {
  console.error('check-migrations: the snapshot chain is broken.\n')
  for (const problem of chainProblems) console.error(`  ${problem}`)
  console.error('\nEvery other check here reads the schema as it stood immediately before a given')
  console.error('migration off the previous snapshot. Where the chain is broken, that comparison')
  console.error('has no real baseline and is silently skipped rather than refused, at exactly the')
  console.error('migrations where a wrong baseline is most dangerous. Restore the missing snapshot')
  console.error('from history (`git show <commit>:path/to/the_snapshot.json`), rather than')
  console.error('regenerating one, so it links up exactly as it originally did. See docs/decisions/0052.')
  process.exit(1)
}

const latest = snapshots.find(s => s.number === Number(newest.slice(0, 4)))?.data ?? {}
const dependentsOnto = dependentsByTable(latest.tables ?? {})

// The table a trigger fires on, read from its body: the name prefix is a
// convention nothing enforces, and the filenames already diverge from it.
const CREATE_TRIGGER = /create\s+trigger\s+(?:if\s+not\s+exists\s+)?`?(\w+)`?\s+(?:before|after|instead\s+of)\s+(?:update(?:\s+of\s+[^]*?)?|delete|insert)\s+on\s+`?(\w+)`?/gi
const DROP_TRIGGER = /drop\s+trigger\s+(?:if\s+exists\s+)?`?(\w+)`?/gi
const REBUILD = /CREATE TABLE `__new_(\w+)`/g
const RENAME = /ALTER TABLE `__new_(\w+)` RENAME TO `\1`/g

interface MigrationEvent { at: number, kind: 'create' | 'drop' | 'rebuild' | 'rename', name?: string, table?: string }

// Every statement this check cares about, in the order the migration runs them.
function eventsIn(sql: string): MigrationEvent[] {
  const events: MigrationEvent[] = []
  for (const m of sql.matchAll(CREATE_TRIGGER)) events.push({ at: m.index, kind: 'create', name: m[1], table: m[2] })
  for (const m of sql.matchAll(DROP_TRIGGER)) events.push({ at: m.index, kind: 'drop', name: m[1] })
  for (const m of sql.matchAll(REBUILD)) events.push({ at: m.index, kind: 'rebuild', table: m[1] })
  for (const m of sql.matchAll(RENAME)) events.push({ at: m.index, kind: 'rename', table: m[1] })
  return events.sort((a, b) => a.at - b.at)
}

// Triggers live across migrations, so replay the whole directory in order.
const liveTriggers = new Map<string, string>()
const problems: string[] = []

for (const file of scan(DIR, '*.sql')) {
  const sql = await Bun.file(join(DIR, file)).text()
  const grandfathered = GRANDFATHERED.has(file.replace(/\.sql$/, ''))
  const rebuilt = new Map<string, string[]>()

  if (!grandfathered) {
    const before = snapshotBefore(Number(file.slice(0, 4)), snapshots)?.tables ?? {}
    for (const copy of copyingInserts(sql)) {
      const sourceColumns = new Set(Object.keys(before[copy.sourceTable]?.columns ?? {}))
      problems.push(...unresolvedCopyProblems(file, copy, sourceColumns))
    }
  }

  for (const event of eventsIn(sql)) {
    if (event.kind === 'create') {
      liveTriggers.set(event.name!, event.table!)
      continue
    }
    if (event.kind === 'drop') {
      liveTriggers.delete(event.name!)
      continue
    }
    if (event.kind === 'rebuild') {
      if (grandfathered) continue
      problems.push(...rebuildDependentProblems(file, event.table!, dependentsOnto.get(event.table!) ?? []))
      continue
    }
    // `DROP TABLE t` takes the table's triggers with it. Only a CREATE after
    // the rename restores one: an earlier one attaches to the doomed table.
    const lost = [...liveTriggers].filter(([, table]) => table === event.table).map(([name]) => name)
    for (const name of lost) liveTriggers.delete(name)
    if (!grandfathered && lost.length) rebuilt.set(event.table!, lost)
  }

  for (const [table, lost] of rebuilt) {
    const dropped = lost.filter(name => liveTriggers.get(name) !== table)
    if (!dropped.length) continue
    problems.push(`${file}: rebuilds \`${table}\`, and dropping it drops its triggers `
      + `${dropped.map(t => `\`${t}\``).join(', ')}, which no snapshot carries and no regenerate re-emits.`)
  }
}

if (problems.length) {
  console.error('check-migrations: a table rebuild would silently corrupt or drop something, or abort outright.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nD1 runs migrations inside a transaction, where `PRAGMA foreign_keys=OFF` is a')
  console.error('no-op, so Drizzle\'s rebuild does not disable the checks it assumes it has. A')
  console.error('cascading or set-null dependent loses rows or a reference silently; a restrict or')
  console.error('no-action dependent aborts the whole migration the moment a referencing row exists,')
  console.error('which an empty development database never has and production always eventually will.')
  console.error('A rebuild is `DROP TABLE` plus a rename, so it also takes every schema object the')
  console.error('Drizzle snapshot does not carry: today that means triggers, and Drizzle cannot')
  console.error('re-emit what it has never seen. Drizzle can also add a column to the copying INSERT')
  console.error('as a double-quoted identifier the old table never had; SQLite reads that as a string')
  console.error('literal rather than erroring, so every copied row silently gets the column\'s own name.')
  console.error('Split the change so no rebuild is needed (add, rename and alter separately), or')
  console.error('hand-author the migration: save and restore what a drop would take, re-creating any')
  console.error('trigger AFTER the `ALTER TABLE __new_… RENAME TO …`, and replace an unresolved')
  console.error('copying column with a real expression.')
  console.error('See docs/decisions/0010-append-only-registers.md and 0052.')
  process.exit(1)
}

const journal: { entries?: JournalEntry[] } = await Bun.file(join(META, '_journal.json')).json()
const disagreements = journalProblems(journal.entries ?? [], scan(DIR, '*.sql'))

if (disagreements.length) {
  console.error('check-migrations: the journal and the migration files disagree.\n')
  for (const problem of disagreements) console.error(`  ${problem}`)
  console.error('\nTwo branches numbering a migration after the same parent is the usual cause.')
  console.error('The branch that merges second renumbers: regenerate it onto the merged main so')
  console.error('the file, its journal entry and its number are one sequence again. Never resolve')
  console.error('a journal conflict by keeping both entries at the same idx.')
  process.exit(1)
}

const guarded = [...dependentsOnto.keys()].length
console.log(`check-migrations: ${guarded} tables have foreign keys guarding a rebuild and `
  + `${liveTriggers.size} triggers are live, none dropped or bypassed. `
  + `${(journal.entries ?? []).length} journal entries match their files. `
  + `${snapshots.length} snapshots chain unbroken.`)
