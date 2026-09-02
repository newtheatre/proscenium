import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The freeze on a module's safety semantics, on the real migrations (G-109). The write path asks
// whether an unrevoked record exists, which is not whether one is currently valid.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'member@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'officer@example.invalid', 'An Officer'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-111', 'TECH', 'CERTIFICATION', 'Working at height', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-222', 'TECH', 'MODULE', 'Ladders', 'ACTIVE'],
  ])
}

function award(database: TestDatabase, columns: Record<string, unknown>): void {
  const values = {
    user_id: 'u1',
    module_id: 'TECH-111',
    awarded_on: '2026-09-14',
    source: 'SIGNOFF',
    granted_by: 'u2',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

// The predicate the write path runs before it lets a frozen field change. One bound parameter
// whatever the module carries, because a count of rows may never become a count of parameters.
const FROZEN = 'SELECT 1 AS held FROM training_records WHERE module_id = ? AND revoked_at IS NULL LIMIT 1'

function frozen(database: TestDatabase, moduleId: string): boolean {
  return rows<{ held: number }>(database, FROZEN, moduleId).length > 0
}

function revoke(database: TestDatabase, id: string): void {
  database.batch([[
    `UPDATE training_records SET revoked_at = ?, revoked_by = 'u2', revoke_reason = ?
     WHERE id = ? AND revoked_at IS NULL`,
    1_780_000_000,
    'Awarded in error',
    id,
  ]])
}

describe('a module with records against it is frozen (G-109 criteria 1 and 2)', () => {
  test('a module nothing has been awarded on is not frozen', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(frozen(database, 'TECH-111')).toBe(false)
    })
  })

  test('one unrevoked record freezes it', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1' })
      expect(frozen(database, 'TECH-111')).toBe(true)
    })
  })

  // The distinction the whole rule turns on: unrevoked, not currently valid. An expired record
  // still says what it certified, and that meaning is what the freeze protects.
  test('a record long expired but never revoked freezes it just the same', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1', awarded_on: '2019-01-01', expires_on: '2020-01-01' })
      expect(frozen(database, 'TECH-111')).toBe(true)
    })
  })

  test('records against another module leave this one editable', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1', module_id: 'TECH-222' })
      expect(frozen(database, 'TECH-111')).toBe(false)
      expect(frozen(database, 'TECH-222')).toBe(true)
    })
  })
})

describe('revoking every record thaws the module (G-109 criterion 3)', () => {
  test('one record revoked, and the fields are editable again', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1' })
      revoke(database, 'r1')
      expect(frozen(database, 'TECH-111')).toBe(false)
    })
  })

  test('revoking some of them is not revoking all of them', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1' })
      award(database, { id: 'r2', user_id: 'u2' })
      revoke(database, 'r1')
      expect(frozen(database, 'TECH-111')).toBe(true)
      revoke(database, 'r2')
      expect(frozen(database, 'TECH-111')).toBe(false)
    })
  })

  // Revocation is a stamp, never a deletion (0010, G-122). Thawing must not cost the history.
  test('the revoked rows are still there afterwards', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r1' })
      revoke(database, 'r1')
      expect(rows(database, `SELECT id FROM training_records WHERE module_id = 'TECH-111'`)).toHaveLength(1)
    })
  })
})

describe('the freeze is asked of the rows, never of a column (0018)', () => {
  // A stored answer would drift the moment a record was revoked, and it would pass every obvious
  // test while doing it. The catalogue carries a policy and no state at all (G-101 criterion 1).
  test('the modules table carries no frozen flag to go stale', async () => {
    await withDatabase((database) => {
      seed(database)
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('modules')`)
        .map(column => column.name)
      expect(columns.some(name => /froz|locked|has_records|record_count/.test(name))).toBe(false)
    })
  })

  test('the question binds one parameter whatever the module carries (0003)', async () => {
    await withDatabase((database) => {
      seed(database)
      for (let index = 0; index < 40; index++) {
        database.batch([[
          `INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)`,
          `bulk${index}`,
          `bulk${index}@example.invalid`,
          `Member ${index}`,
        ]])
        award(database, { id: `bulk-${index}`, user_id: `bulk${index}` })
      }
      expect(FROZEN.split('?')).toHaveLength(2)
      expect(frozen(database, 'TECH-111')).toBe(true)
    })
  })
})
