import { describe, expect, test } from 'bun:test'
import { chunked } from '#shared/utils/approvals'
import {
  DELIVERY_ATTENDEES_MAX,
  DELIVERY_RECORDS_PER_STATEMENT,
  DELIVERY_RECORD_COLUMNS,
} from '#shared/utils/training'
import { MAX_BOUND_PARAMETERS, createTestDatabase, rows } from '#tests/helpers/database'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'

// G-118 criterion 4 against 0003: a whole retrospective log is one batch, and no statement in it
// binds a parameter per person taught. Thirty people across three modules is ninety records.

const ATTENDEES = 30
const MODULES = 3

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
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'trainer', 'trainer@example.invalid', 'A Trainer'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
  ])
  for (let index = 0; index < MODULES; index++) {
    database.batch([['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      `TECH-${index}`, 'TECH', 'MODULE', `Module ${index}`, 'ACTIVE']])
  }
  for (let index = 0; index < ATTENDEES; index++) {
    database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)',
      `u${index}`, `member${index}@example.invalid`, `Member ${index}`]])
  }
}

interface Record {
  id: string
  userId: string
  moduleId: string
}

// Every attendee times every module, the set a log's dry-run and its write both compute.
function planned(moduleIds = [...Array.from({ length: MODULES }, (_, index) => `TECH-${index}`)]): Record[] {
  const records: Record[] = []
  for (let index = 0; index < ATTENDEES; index++) {
    for (const moduleId of moduleIds) records.push({ id: `r-${index}-${moduleId}`, userId: `u${index}`, moduleId })
  }
  return records
}

// The shape the route writes: a fixed column list, a fixed number of rows per statement.
function statements(records: Record[], heldOn = '2026-08-14', perStatement = DELIVERY_RECORDS_PER_STATEMENT): BoundStatement[] {
  return chunked(records, perStatement).map((part) => {
    const values = part.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
    const bound = part.flatMap(record =>
      [record.id, record.userId, record.moduleId, heldOn, null, 'SESSION', 'trainer'])
    return [
      `INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source, granted_by) VALUES ${values}`,
      ...bound,
    ] as BoundStatement
  })
}

describe('a log of ninety records is one batch of small statements (G-118 criterion 4, 0003)', () => {
  test('no statement binds more than the chunk limit, whatever the room held', () => {
    const written = statements(planned())
    expect(planned()).toHaveLength(ATTENDEES * MODULES)
    for (const [, ...parameters] of written) {
      expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
    }
    // The count of statements grows with the log; the parameters any one of them binds do not.
    expect(new Set(written.map(([, ...parameters]) => parameters.length)).size).toBeLessThanOrEqual(2)
  })

  test('the whole log lands in one batch', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch(statements(planned()))
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(ATTENDEES * MODULES)
      expect(rows<{ n: number }>(database, `SELECT count(DISTINCT awarded_on) n FROM training_records`)[0]?.n)
        .toBe(1)
    })
  })

  // The harness refuses what D1 refuses, so this is the test that would have caught writing the
  // log as one INSERT: SQLite takes it and production would not.
  test('the same log as one statement is refused by the cap the harness holds', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch(statements(planned(), '2026-08-14', ATTENDEES * MODULES))).toThrow()
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(0)
    })
  })

  test('a full room of one module chunks the same way', () => {
    const full = Array.from({ length: DELIVERY_ATTENDEES_MAX }, (_, index) =>
      ({ id: `r${index}`, userId: `u${index}`, moduleId: 'TECH-0' }))
    const [first] = statements(full)
    expect(first!.length - 1).toBe(DELIVERY_RECORDS_PER_STATEMENT * DELIVERY_RECORD_COLUMNS)
  })
})

describe('a log is all of it or none of it (G-118 criterion 4)', () => {
  test('one statement failing leaves no record behind', async () => {
    await withDatabase((database) => {
      seed(database)
      const records = planned()
      // A module nobody created: the last statement raises on its foreign key.
      records.push({ id: 'r-nope', userId: 'u0', moduleId: 'TECH-NOPE' })

      expect(() => database.batch(statements(records))).toThrow()
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(0)
    })
  })
})

describe('a logged record is append-only like every other (0010)', () => {
  test('its award date cannot be edited afterwards', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch(statements(planned(['TECH-0'])))
      expect(() => database.batch([[`UPDATE training_records SET awarded_on = '2026-01-01' WHERE id = 'r-0-TECH-0'`]]))
        .toThrow()
      expect(() => database.batch([[`DELETE FROM training_records WHERE id = 'r-0-TECH-0'`]])).toThrow()
    })
  })

  // Correction is revocation and a fresh log, which the trigger's allow-list admits.
  test('it can still be revoked', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch(statements(planned(['TECH-0'])))
      database.batch([[
        `UPDATE training_records SET revoked_at = unixepoch(), revoked_by = 'trainer', revoke_reason = ? WHERE id = 'r-0-TECH-0'`,
        'Logged in error',
      ]])
      expect(rows<{ revoked: number }>(database, `SELECT revoked_at revoked FROM training_records WHERE id = 'r-0-TECH-0'`)[0]?.revoked)
        .toBeGreaterThan(0)
    })
  })
})
