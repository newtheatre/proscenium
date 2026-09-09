import { describe, expect, test } from 'bun:test'
import {
  copyingInserts,
  dependentsByTable,
  journalProblems,
  normaliseMigrationTag,
  pendingMigrations,
  rebuildDependentProblems,
  snapshotBefore,
  unresolvedCopyProblems,
} from '#shared/utils/migrations'

describe('pending migrations (K-107)', () => {
  test('a schema level with its code reports nothing pending', () => {
    expect(pendingMigrations(['0000_first', '0001_second'], ['0000_first', '0001_second'])).toEqual([])
  })

  test('a deploy ahead of its schema names every pending file', () => {
    expect(pendingMigrations(['0000_first', '0001_second'], ['0000_first'])).toEqual(['0001_second'])
  })

  test('an empty ledger means every migration is pending', () => {
    expect(pendingMigrations(['0000_first'], [])).toEqual(['0000_first'])
  })

  test('both ledger spellings count as applied', () => {
    expect(pendingMigrations(['0000_first'], ['0000_first.sql'])).toEqual([])
    expect(normaliseMigrationTag('0000_first.sql')).toBe('0000_first')
  })

  test('a database ahead of its code is not pending', () => {
    expect(pendingMigrations(['0000_first'], ['0000_first', '0001_ahead'])).toEqual([])
  })
})

// unified/main ended at 0019 while nine open branches each added an 0020. Git stops the second
// merge on the journal, and a resolver keeping both entries is what this refuses.
describe('the journal and the files are one sequence', () => {
  const entry = (idx: number, tag: string): { idx: number, tag: string } => ({ idx, tag })

  test('a journal matching its files has nothing to say', () => {
    expect(journalProblems(
      [entry(0, '0000_first'), entry(1, '0001_second')],
      ['0000_first.sql', '0001_second.sql'],
    )).toEqual([])
  })

  test('two branches numbering after the same parent are caught, not merged', () => {
    const problems = journalProblems(
      [entry(19, '0019_shared'), entry(20, '0020_theirs'), entry(20, '0020_ours')],
      ['0019_shared.sql', '0020_theirs.sql', '0020_ours.sql'],
    )
    expect(problems.some(problem => problem.includes('idx 20 is claimed by'))).toBe(true)
  })

  test('a renumbered file whose entry was not moved with it is caught', () => {
    const problems = journalProblems([entry(20, '0033_moved')], ['0033_moved.sql'])
    expect(problems.some(problem => problem.includes('its number and its place disagree'))).toBe(true)
  })

  test('a journal entry with no file stops the ledger there', () => {
    expect(journalProblems([entry(0, '0000_missing')], []))
      .toEqual(['`0000_missing` is in the journal and has no .sql file.'])
  })

  test('a file in no entry never runs at all', () => {
    expect(journalProblems([], ['0000_orphan.sql']))
      .toEqual(['`0000_orphan.sql` is on disk and in no journal entry, so it never runs.'])
  })
})

// A rebuild's own DROP TABLE runs with foreign keys enforced, so a restrict dependent aborts
// the migration outright rather than losing rows quietly; only cascade was checked before.
describe('a table rebuild is refused against every kind of dependent (0010)', () => {
  test('a restrict dependent is refused, not waved through', () => {
    const problems = rebuildDependentProblems('0001_rebuild.sql', 'ticket_types', [
      { table: 'tickets', onDelete: 'restrict' },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('`tickets`')
    expect(problems[0]).toContain('the whole migration aborts')
  })

  // Drizzle emits this explicitly when a schema names no onDelete at all; SQLite treats it the
  // same as restrict for an immediate (non-deferred) constraint.
  test('a no-action dependent is refused the same way as restrict', () => {
    const problems = rebuildDependentProblems('0001_rebuild.sql', 'ticket_types', [
      { table: 'tickets', onDelete: 'no action' },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('the whole migration aborts')
  })

  test('a cascade dependent is refused for losing rows, not for aborting', () => {
    const problems = rebuildDependentProblems('0001_rebuild.sql', 'parent', [
      { table: 'child', onDelete: 'cascade' },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('go silently')
  })

  test('a set-null dependent is refused for severing the reference, not for aborting', () => {
    const problems = rebuildDependentProblems('0001_rebuild.sql', 'parent', [
      { table: 'child', onDelete: 'set null' },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('silently severed')
  })

  test('a table rebuilt with no incoming foreign key at all has nothing to refuse', () => {
    expect(rebuildDependentProblems('0001_rebuild.sql', 'orphan', [])).toEqual([])
  })

  // Three tables, three different guards: F-105's own ticket_types shape, named directly so a
  // regression here reads as "the #757 case" rather than an abstract fixture.
  test('a table with dependents of every kind gets one message per kind, not one per table', () => {
    const problems = rebuildDependentProblems('0001_rebuild.sql', 'ticket_types', [
      { table: 'tickets', onDelete: 'restrict' },
      { table: 'show_ticket_overrides', onDelete: 'restrict' },
      { table: 'performance_ticket_overrides', onDelete: 'restrict' },
      { table: 'archived_types', onDelete: 'cascade' },
      { table: 'promo_codes', onDelete: 'set null' },
    ])
    expect(problems).toHaveLength(3)
    const blocking = problems.find(p => p.includes('the whole migration aborts'))!
    expect(blocking).toContain('`tickets`')
    expect(blocking).toContain('`show_ticket_overrides`')
    expect(blocking).toContain('`performance_ticket_overrides`')
  })

  test('dependentsByTable indexes a foreign key by the table it points at, defaulting a missing onDelete to no action', () => {
    const index = dependentsByTable({
      tickets: { name: 'tickets', foreignKeys: { fk1: { tableTo: 'ticket_types', onDelete: 'restrict' } } },
      show_ticket_overrides: { name: 'show_ticket_overrides', foreignKeys: { fk1: { tableTo: 'ticket_types' } } },
    })
    expect(index.get('ticket_types')).toEqual([
      { table: 'tickets', onDelete: 'restrict' },
      { table: 'show_ticket_overrides', onDelete: 'no action' },
    ])
  })
})

// The #760 case, pinned before its hand correction: the old venue_emergency_info had no `id`
// column, its primary key was venue_id, and drizzle-kit copied "id" into the new column anyway.
const UNCORRECTED_0073 = 'INSERT INTO `__new_venue_emergency_info`("id", "venue_id", "assembly_point", '
  + '"exits", "isolation_points", "what3words", "notes", "updated_by", "updated_at") '
  + 'SELECT "id", "venue_id", "assembly_point", "exits", "isolation_points", "what3words", '
  + '"notes", "updated_by", "updated_at" FROM `venue_emergency_info`;'

const CORRECTED_0073 = 'INSERT INTO `__new_venue_emergency_info`("id", "venue_id", "assembly_point", '
  + '"exits", "isolation_points", "what3words", "notes", "updated_by", "updated_at") '
  + 'SELECT lower(hex(randomblob(16))), "venue_id", "assembly_point", "exits", "isolation_points", '
  + '"what3words", "notes", "updated_by", "updated_at" FROM `venue_emergency_info`;'

const OLD_VENUE_EMERGENCY_COLUMNS = new Set([
  'venue_id', 'assembly_point', 'exits', 'isolation_points', 'what3words', 'notes', 'updated_by', 'updated_at',
])

describe('a rebuild refuses a copying column that does not resolve (0052)', () => {
  test('copyingInserts reads the source table and the SELECT list off a real migration', () => {
    const [copy] = copyingInserts(UNCORRECTED_0073)
    expect(copy).toEqual({
      targetTable: 'venue_emergency_info',
      sourceTable: 'venue_emergency_info',
      selected: [
        '"id"', '"venue_id"', '"assembly_point"', '"exits"',
        '"isolation_points"', '"what3words"', '"notes"', '"updated_by"', '"updated_at"',
      ],
    })
  })

  // The regression case itself: this is what let #760 through before a human caught it.
  test('the uncorrected #760 migration is refused for "id"', () => {
    const [copy] = copyingInserts(UNCORRECTED_0073)
    const problems = unresolvedCopyProblems('0073_venue_emergency.sql', copy!, OLD_VENUE_EMERGENCY_COLUMNS)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('"id"')
    expect(problems[0]).toContain('`venue_emergency_info`')
    expect(problems[0]).toContain('string literal')
  })

  test('the corrected #760 migration, a real expression in place of "id", is not refused', () => {
    const [copy] = copyingInserts(CORRECTED_0073)
    expect(unresolvedCopyProblems('0073_venue_emergency.sql', copy!, OLD_VENUE_EMERGENCY_COLUMNS)).toEqual([])
  })

  test('a double-quoted column the source table actually has is never flagged', () => {
    const problems = unresolvedCopyProblems('0001_rebuild.sql',
      { targetTable: 'x', sourceTable: 'x', selected: ['"venue_id"'] },
      new Set(['venue_id']))
    expect(problems).toEqual([])
  })

  // A backtick, a bracket or a bare word has no string-literal fallback: an unresolvable one
  // fails the migration outright, which the scratch-database tests already catch (0052).
  test('a non-double-quoted identifier is never flagged, whatever it names', () => {
    const problems = unresolvedCopyProblems('0001_rebuild.sql',
      { targetTable: 'x', sourceTable: 'x', selected: ['`nonexistent`', 'nonexistent', '[nonexistent]'] },
      new Set())
    expect(problems).toEqual([])
  })

  test('an expression, however it is shaped, is never flagged', () => {
    const problems = unresolvedCopyProblems('0001_rebuild.sql',
      { targetTable: 'x', sourceTable: 'x', selected: ['lower(hex(randomblob(16)))', '\'a literal\'', '0', 'NULL'] },
      new Set())
    expect(problems).toEqual([])
  })

  test('snapshotBefore finds the highest-numbered snapshot below the migration, skipping a gap', () => {
    const snapshots = [{ number: 70, data: 'seventy' }, { number: 72, data: 'seventy-two' }, { number: 73, data: 'seventy-three' }]
    expect(snapshotBefore(73, snapshots)).toBe('seventy-two')
    expect(snapshotBefore(71, snapshots)).toBe('seventy')
    expect(snapshotBefore(70, snapshots)).toBeUndefined()
  })
})
