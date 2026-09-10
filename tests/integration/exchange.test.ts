import { describe, expect, test } from 'bun:test'
import { claimForExchangeStatement } from '#server/utils/exchange'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-111 against the real migrations. `exchangeReservation()` reads the real `db` binding, so
// what is tested is the statement it claims the old reservation with (holds.test.ts, the same split).

async function withDatabase(fn: (database: TestDatabase) => void): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'booker@example.invalid', 'Booker']])
    fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: ReturnType<typeof claimForExchangeStatement>): { id: string }[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as { id: string }[]
}

function reserve(database: TestDatabase, id: string, performanceId: string, status = 'PENDING'): void {
  database.batch([[
    'INSERT INTO reservations (id, reference, performance_id, user_id, status, source, hold_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase(), performanceId, 'u-1', status, 'WEB', 9_999_999_999,
  ]])
}

// A stand-in for the new hold `writeReservation()` secures first (D-104): the claim's own FK
// needs a real row to point to, exactly as it does once the whole exchange actually runs.
function newHold(database: TestDatabase, id: string, performanceId: string): void {
  reserve(database, id, performanceId)
}

describe('claiming the old reservation for an exchange is race-safe (criterion 1, 0003)', () => {
  test('the winner is the RETURNING row; a PENDING hold moves to cancelled-with-a-pointer', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      reserve(database, 'r-1', seeded.performanceId)
      newHold(database, 'r-new', seeded.performanceId)

      const found = run(database, claimForExchangeStatement('r-1', 'r-new'))
      expect(found).toEqual([{ id: 'r-1' }])

      const row = rows<{ status: string, cancelledBy: string, exchangedTo: string, holdExpiresAt: number | null }>(
        database,
        'SELECT status, cancelled_by AS cancelledBy, exchanged_to_reservation_id AS exchangedTo, hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?',
        'r-1',
      )[0]
      expect(row).toEqual({ status: 'CANCELLED', cancelledBy: 'CUSTOMER', exchangedTo: 'r-new', holdExpiresAt: null })
    })
  })

  test('two concurrent exchanges of the same booking leave exactly one winner', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      reserve(database, 'r-1', seeded.performanceId)
      newHold(database, 'r-new-a', seeded.performanceId)
      newHold(database, 'r-new-b', seeded.performanceId)

      const first = run(database, claimForExchangeStatement('r-1', 'r-new-a'))
      const second = run(database, claimForExchangeStatement('r-1', 'r-new-b'))

      expect([first.length, second.length].sort()).toEqual([0, 1])
      const row = rows<{ exchangedTo: string }>(database, 'SELECT exchanged_to_reservation_id AS exchangedTo FROM reservations WHERE id = ?', 'r-1')[0]
      expect(row?.exchangedTo === 'r-new-a' || row?.exchangedTo === 'r-new-b').toBe(true)
    })
  })

  test('an exchange racing a desk collection loses cleanly: only one of the two wins', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      reserve(database, 'r-1', seeded.performanceId)
      newHold(database, 'r-new', seeded.performanceId)

      const collected = database.raw.prepare(`UPDATE reservations SET status = 'COLLECTED' WHERE id = ? AND status = 'PENDING'`).run('r-1').changes
      const exchanged = run(database, claimForExchangeStatement('r-1', 'r-new'))

      expect(collected).toBe(1)
      expect(exchanged).toEqual([])
      const row = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', 'r-1')[0]
      expect(row?.status).toBe('COLLECTED')
    })
  })

  test('something already settled (not PENDING) claims nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      reserve(database, 'r-1', seeded.performanceId, 'CANCELLED')
      newHold(database, 'r-new', seeded.performanceId)

      expect(run(database, claimForExchangeStatement('r-1', 'r-new'))).toEqual([])
    })
  })
})
