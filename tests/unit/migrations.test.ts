import { describe, expect, test } from 'bun:test'
import {
  dependentsByTable,
  journalProblems,
  normaliseMigrationTag,
  pendingMigrations,
  rebuildDependentProblems,
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
