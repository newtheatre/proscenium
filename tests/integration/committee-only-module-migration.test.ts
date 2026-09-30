import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { withMigration } from '#tests/helpers/migrations'

// Decision 0115's column against the shape it meets: every module already in the catalogue stays
// open to self sign-up, and a new one is too unless somebody marks it. Found by name, not number.

const NAME = '_a_committee_only_module_says_so'

function catalogue(raw: Database): void {
  raw.query('INSERT INTO departments (code, name) VALUES (?, ?)').run('ADMN', 'Administration and Front of House')
  raw.query('INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)').run('ADMN-201', 'ADMN', 'MODULE', 'Committee Operations and Governance', 'ACTIVE')
}

describe('modules gain a committee-only flag (0115)', () => {
  test('a module already in the catalogue is not committee-only', async () => {
    await withMigration(NAME, catalogue, (raw) => {
      expect(raw.query('SELECT committee_only FROM modules WHERE id = ?').get('ADMN-201')).toEqual({ committee_only: 0 })
    })
  })

  test('a module written afterwards defaults to open, and may be marked', async () => {
    await withMigration(NAME, catalogue, (raw) => {
      raw.query('INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)').run('ADMN-101', 'ADMN', 'MODULE', 'Front of House Management')
      raw.query('UPDATE modules SET committee_only = 1 WHERE id = ?').run('ADMN-201')
      expect(raw.query('SELECT id, committee_only FROM modules ORDER BY id').all()).toEqual([
        { id: 'ADMN-101', committee_only: 0 },
        { id: 'ADMN-201', committee_only: 1 },
      ])
    })
  })

  test('the flag is never null', async () => {
    await withMigration(NAME, catalogue, (raw) => {
      expect(() => raw.query('UPDATE modules SET committee_only = NULL WHERE id = ?').run('ADMN-201')).toThrow(/NOT NULL/)
    })
  })
})
