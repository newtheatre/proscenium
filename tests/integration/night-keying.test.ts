import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// E-127 criterion 1: everything operational keys to a performance, never a day or a venue.
// Checked against the real schema, not asserted in prose, the way this found `checklist_stamps` wrong.

function columnsOf(database: TestDatabase, table: string): string[] {
  return rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('${table}')`).map(column => column.name)
}

describe('every operational table keys to a performance (criterion 1)', () => {
  test.each([
    'shifts',
    'incidents',
    // Nullable by design: bar checks age outside a show as well as inside one (E-118).
    'age_checks',
  ])('%s carries performance_id', async (table) => {
    const database = await createTestDatabase()
    try {
      expect(columnsOf(database, table)).toContain('performance_id')
    }
    finally {
      database.close()
    }
  })

  test('ledger_lines carries performance_id, unconstrained by design (0033)', async () => {
    const database = await createTestDatabase()
    try {
      expect(columnsOf(database, 'ledger_lines')).toContain('performance_id')
    }
    finally {
      database.close()
    }
  })
})

describe('the one exception this story found, deferred rather than built around', () => {
  test('checklist_stamps and checklist_closes still key to venue_id and night, not performance_id', async () => {
    const database = await createTestDatabase()
    try {
      for (const table of ['checklist_stamps', 'checklist_closes']) {
        const columns = columnsOf(database, table)
        expect(columns).toContain('venue_id')
        expect(columns).toContain('night')
        expect(columns).not.toContain('performance_id')
      }
    }
    finally {
      database.close()
    }
  })
})
