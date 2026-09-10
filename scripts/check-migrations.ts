#!/usr/bin/env bun
// A generated table rebuild silently deletes every cascading row, drops every schema object the
// snapshot does not carry, and can corrupt an added column. Refusing one is 0010 and 0052.

import { join } from 'node:path'
import {
  copyingInserts,
  dependentsByTable,
  journalProblems,
  migrationEventsIn,
  rebuildDependentProblems,
  snapshotBefore,
  snapshotChainProblems,
  triggerDropProblems,
  unresolvedCopyProblems,
} from '../shared/utils/migrations'
import type { JournalEntry, SnapshotTable } from '../shared/utils/migrations'

const DIR = 'server/db/migrations/sqlite'
const META = join(DIR, 'meta')

// The estate carried two rebuilds applied before the rule existed. This schema starts clean,
// so a rebuild here is always a defect.
const GRANDFATHERED = new Set<string>()

// Waives `rebuildDependentProblems` alone, never the copying-column or trigger-drop checks: a
// narrow, named, human-reviewed exemption, each entry citing why (0063).
const HAND_REVIEWED_REBUILDS = new Set<string>([
  // night_reports has two restrict dependents (night_report_addenda, night_report_deliveries),
  // rebuilt around it in the order verified against a real fixture in 0063, not reasoned about.
  '0093_auto_close_within_24_hours',
])

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

// Triggers live across migrations, so replay the whole directory in order.
const liveTriggers = new Map<string, string>()
const problems: string[] = []

for (const file of scan(DIR, '*.sql')) {
  const sql = await Bun.file(join(DIR, file)).text()
  const grandfathered = GRANDFATHERED.has(file.replace(/\.sql$/, ''))
  const handReviewed = HAND_REVIEWED_REBUILDS.has(file.replace(/\.sql$/, ''))

  if (!grandfathered) {
    const before = snapshotBefore(Number(file.slice(0, 4)), snapshots)?.tables ?? {}
    for (const copy of copyingInserts(sql)) {
      const sourceColumns = new Set(Object.keys(before[copy.sourceTable]?.columns ?? {}))
      problems.push(...unresolvedCopyProblems(file, copy, sourceColumns))
    }
  }

  const events = migrationEventsIn(sql)

  if (!grandfathered && !handReviewed) {
    for (const event of events) {
      if (event.kind !== 'rebuild') continue
      problems.push(...rebuildDependentProblems(file, event.table!, dependentsOnto.get(event.table!) ?? []))
    }
  }

  problems.push(...triggerDropProblems(file, events, liveTriggers, grandfathered))
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
