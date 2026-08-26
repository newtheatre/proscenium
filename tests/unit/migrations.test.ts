import { describe, expect, test } from 'bun:test'
import { normaliseMigrationTag, pendingMigrations } from '../../shared/migrations'

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
