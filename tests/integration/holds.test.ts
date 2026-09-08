import { describe, expect, test } from 'bun:test'
import {
  expiredHoldsQuery,
  releaseHoldStatement,
  reminderCandidatesQuery,
} from '#server/utils/holds'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-106 and D-107 against the real rule. The write path that sets `hold_expires_at` is D-104's;
// this is the release and reminder side of what it wrote.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'booker@example.invalid', 'Booker']])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: ReturnType<typeof releaseHoldStatement>): void {
  const [query, ...parameters] = boundStatement(database, statement)
  database.raw.prepare(query).run(...parameters as never[])
}

function reserve(database: TestDatabase, id: string, performanceId: string, holdExpiresAt: number | null, status = 'PENDING'): string {
  database.batch([[
    'INSERT INTO reservations (id, reference, performance_id, user_id, status, source, hold_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, 'u-1', status, 'WEB', holdExpiresAt,
  ]])
  return id
}

describe('a hold releases at its own predicate, decided from RETURNING (D-106 criterion 5)', () => {
  test('a PENDING hold past its expiry is released', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const id = reserve(database, 'r-1', seeded.performanceId, seeded.startsAt - 900)
      run(database, releaseHoldStatement(id))
      expect(rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', id)[0]?.status).toBe('EXPIRED')
    })
  })

  test('a hold already moved off PENDING writes nothing: the write, not a stored actor, decides', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const id = reserve(database, 'r-1', seeded.performanceId, seeded.startsAt - 900, 'CANCELLED')
      const [query, ...parameters] = boundStatement(database, releaseHoldStatement(id))
      const changed = database.raw.prepare(query).run(...parameters as never[]).changes
      expect(changed).toBe(0)
      expect(rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', id)[0]?.status).toBe('CANCELLED')
    })
  })

  // D-106 criterion 5: a simultaneous desk collection and an expiry race for the same hold.
  // D-114 does not exist yet, so this stands in for its write, as D-105's own tests once did for D-118's.
  test('a collection racing a release leaves exactly one winner', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const id = reserve(database, 'r-1', seeded.performanceId, seeded.startsAt - 900)

      const collectStatement = `UPDATE reservations SET status = 'COLLECTED' WHERE id = ? AND status = 'PENDING'`
      const collected = database.raw.prepare(collectStatement).run(id).changes
      const [query, ...parameters] = boundStatement(database, releaseHoldStatement(id))
      const released = database.raw.prepare(query).run(...parameters as never[]).changes

      expect([collected, released].sort()).toEqual([0, 1])
      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', id)[0]?.status
      expect(status === 'COLLECTED' || status === 'EXPIRED').toBe(true)
    })
  })
})

describe('the batch a release run finds (D-106 criterion 2)', () => {
  test('only PENDING holds past their own expiry are eligible, oldest first', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      reserve(database, 'r-future', seeded.performanceId, seeded.startsAt + 900)
      reserve(database, 'r-collected', seeded.performanceId, seeded.startsAt - 900, 'COLLECTED')
      reserve(database, 'r-late', seeded.performanceId, seeded.startsAt - 100)
      reserve(database, 'r-early', seeded.performanceId, seeded.startsAt - 200)

      const found = rows<{ id: string }>(database, ...boundStatement(database, expiredHoldsQuery(seeded.startsAt, 10)))
      expect(found.map(row => row.id)).toEqual(['r-early', 'r-late'])
    })
  })

  test('the cap bounds the batch whatever the backlog', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      for (let i = 0; i < 5; i += 1) reserve(database, `r-${i}`, seeded.performanceId, seeded.startsAt - 100 - i)
      const found = rows<{ id: string }>(database, ...boundStatement(database, expiredHoldsQuery(seeded.startsAt, 2)))
      expect(found).toHaveLength(2)
    })
  })
})

describe('the batch a reminder run finds (D-107 criteria 1, 4)', () => {
  test('a hold inside the reminder window and not yet expired is a candidate', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const expiresAt = seeded.startsAt - 900
      reserve(database, 'r-1', seeded.performanceId, expiresAt)

      // Ten minutes before the hold releases, with a fifteen-minute reminder window.
      const at = expiresAt - 10 * 60
      const found = rows<{ id: string }>(database, ...boundStatement(database, reminderCandidatesQuery(at, 15, 10)))
      expect(found.map(row => row.id)).toEqual(['r-1'])
    })
  })

  test('a hold not yet inside the window is not a candidate', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const expiresAt = seeded.startsAt - 900
      reserve(database, 'r-1', seeded.performanceId, expiresAt)

      const at = expiresAt - 20 * 60
      const found = rows<{ id: string }>(database, ...boundStatement(database, reminderCandidatesQuery(at, 15, 10)))
      expect(found).toEqual([])
    })
  })

  // Criterion 4: collected or cancelled before the reminder time sends nothing. Neither status
  // is PENDING, so the predicate excludes both without a second check.
  test('a collected or cancelled hold is never a candidate, even inside the window', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const expiresAt = seeded.startsAt - 900
      reserve(database, 'r-collected', seeded.performanceId, expiresAt, 'COLLECTED')
      reserve(database, 'r-cancelled', seeded.performanceId, expiresAt, 'CANCELLED')

      const at = expiresAt - 10 * 60
      const found = rows<{ id: string }>(database, ...boundStatement(database, reminderCandidatesQuery(at, 15, 10)))
      expect(found).toEqual([])
    })
  })

  test('an already-expired hold is the release job\'s to find, not the reminder\'s', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const expiresAt = seeded.startsAt - 900
      reserve(database, 'r-1', seeded.performanceId, expiresAt)

      const found = rows<{ id: string }>(database, ...boundStatement(database, reminderCandidatesQuery(expiresAt + 60, 15, 10)))
      expect(found).toEqual([])
    })
  })
})
