import { describe, expect, test } from 'bun:test'
import { journalProblems, normaliseMigrationTag, pendingMigrations } from '#shared/utils/migrations'

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
