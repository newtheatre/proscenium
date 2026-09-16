import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-118 criterion 3 on the real migrations: a closed session's figures are append-only, and the
// night the till, the comp queue and the SumUp hand-off all key on is a date (0010, 0063, 0014).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  insert(database, 'users', { id, email: `person-${suffix}@example.invalid`, name: `Person ${suffix}` })
  return id
}

function venue(database: TestDatabase, suffix = '1'): string {
  const id = `v-${suffix}`
  insert(database, 'venues', { id, name: `Venue ${suffix}`, capacity: 120 })
  return id
}

interface Ground { venueId: string, userId: string }

function ground(database: TestDatabase): Ground {
  return { venueId: venue(database), userId: person(database) }
}

function session(database: TestDatabase, at: Ground, over: Record<string, unknown> = {}): string {
  const values = { id: 'ts-1', venue_id: at.venueId, night: '2026-09-15', opened_by: at.userId, opened_at: 1000, ...over }
  insert(database, 'till_sessions', values)
  return String(values.id)
}

const closed = (userId: string): Record<string, unknown> => ({
  closed_by: userId, closed_at: 2000, expected_total_pence: 5000, actual_z_pence: 5000, variance_pence: 0,
})

describe('a closed session is append-only, and a correction is a new fact (F-118 criterion 3, 0010)', () => {
  test('a session still open closes exactly once', async () => {
    await withDatabase((database) => {
      const at = ground(database)
      session(database, at)
      const userId = at.userId
      const close = (at: number, z: number): void => {
        database.batch([[
          'UPDATE till_sessions SET closed_by = ?, closed_at = ?, actual_z_pence = ? WHERE id = ? AND closed_at IS NULL',
          userId, at, z, 'ts-1',
        ]])
      }
      close(2000, 5000)
      // The loser of a race matches no row, so the trigger never fires and its batch still commits.
      close(3000, 9900)

      expect(rows<{ closed_at: number, actual_z_pence: number }>(database, 'SELECT closed_at, actual_z_pence FROM till_sessions')[0])
        .toEqual({ closed_at: 2000, actual_z_pence: 5000 })
    })
  })

  test('the Z figure on a closed session cannot be rewritten', async () => {
    await withDatabase((database) => {
      const at = ground(database)
      session(database, at, closed(at.userId))

      expect(() => database.batch([['UPDATE till_sessions SET actual_z_pence = 9900 WHERE id = ?', 'ts-1']]))
        .toThrow(/append-only/)
      expect(rows<{ actual_z_pence: number }>(database, 'SELECT actual_z_pence FROM till_sessions')[0]?.actual_z_pence).toBe(5000)
    })
  })

  test('neither can its variance note, nor its close reopened', async () => {
    await withDatabase((database) => {
      const at = ground(database)
      session(database, at, closed(at.userId))

      expect(() => database.batch([['UPDATE till_sessions SET variance_note = ? WHERE id = ?', 'Recounted', 'ts-1']])).toThrow()
      expect(() => database.batch([['UPDATE till_sessions SET closed_at = NULL, closed_by = NULL WHERE id = ?', 'ts-1']])).toThrow()
    })
  })
})

describe('the night a session, a comp request and a hand-off key on is a date (0014, 0063)', () => {
  test('a till session refuses a night that is not YYYY-MM-DD', async () => {
    await withDatabase((database) => {
      const at = ground(database)
      expect(() => session(database, at, { night: '15 September' })).toThrow()
      expect(() => session(database, at, { id: 'ts-2', night: '2026-9-5' })).toThrow()
      session(database, at, { id: 'ts-3', night: '2026-09-15' })
    })
  })

  test('a comp request refuses one too', async () => {
    await withDatabase((database) => {
      const { venueId, userId } = ground(database)
      const row = (id: string, night: string) => ({
        id, venue_id: venueId, night, requested_by: userId, reason: 'A round', lines: '[]',
      })
      expect(() => insert(database, 'comp_requests', row('cr-1', 'tonight'))).toThrow()
      insert(database, 'comp_requests', row('cr-2', '2026-09-15'))
    })
  })

  test('a SumUp hand-off refuses one too', async () => {
    await withDatabase((database) => {
      const at = ground(database)
      session(database, at)
      const { venueId, userId } = at
      const row = (id: string, night: string) => ({
        id, till_session_id: 'ts-1', venue_id: venueId, night, created_by: userId,
        basket: '[]', expected_total_pence: 500,
      })
      expect(() => insert(database, 'sumup_attempts', row('sa-1', '2026-13-45'))).toThrow()
      insert(database, 'sumup_attempts', row('sa-2', '2026-09-15'))
    })
  })
})
