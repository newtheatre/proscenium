import { describe, expect, test } from 'bun:test'
import { readTeamRow, tonightHouseQuery, tonightPerformanceQuery, tonightTeamQuery } from '#server/utils/tonight'
import { ticketInsertQueries } from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'
import type { ShiftStatus } from '#shared/utils/rota'

// E-112 against the real migrations. `tests/unit/tonight.test.ts` pins `readTeamRow` in the pure.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, phone, verified) VALUES (?, ?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`, '07700 900000']])
  return id
}

function reserve(database: TestDatabase, id: string, performanceId: string, status = 'PENDING'): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, status, 'WEB']])
}

function ticket(database: TestDatabase, id: string, performanceId: string, reservationId: string, refunded = false): void {
  const [statement] = ticketInsertQueries([{ id, reservationId, performanceId, ticketTypeId: 'tt-standard', pricePaid: 900, priceSource: 'BASE' }], null)
  database.batch([boundStatement(database, statement!)])
  if (refunded) database.batch([['UPDATE tickets SET refunded_at = unixepoch() WHERE id = ?', id]])
}

describe('the house numbers (E-112 criterion 1)', () => {
  test('nothing sold and nobody admitted reads as nought, not fabricated', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 0, admitted: 0 })
    })
  })

  test('a pending hold and a desk collection both count as sold', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-pending', tonight.performanceId, 'PENDING')
      ticket(database, 't-pending', tonight.performanceId, 'r-pending')
      reserve(database, 'r-collected', tonight.performanceId, 'COLLECTED')
      ticket(database, 't-collected', tonight.performanceId, 'r-collected')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 2, admitted: 0 })
    })
  })

  test('a door-admitted reservation counts as both sold and admitted', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-door', tonight.performanceId, 'DOOR')
      ticket(database, 't-door', tonight.performanceId, 'r-door')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 1, admitted: 1 })
    })
  })

  test('a refunded ticket and an expired hold neither count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-refunded', tonight.performanceId, 'PENDING')
      ticket(database, 't-refunded', tonight.performanceId, 'r-refunded', true)
      reserve(database, 'r-expired', tonight.performanceId, 'EXPIRED')
      ticket(database, 't-expired', tonight.performanceId, 'r-expired')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 0, admitted: 0 })
    })
  })
})

describe('the team roster (E-112 criterion 2)', () => {
  function shift(database: TestDatabase, id: string, performanceId: string, status: ShiftStatus, userId: string | null): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      id, performanceId, 'DOOR', userId, status]])
  }

  test('a confirmed, consenting holder shows their name and phone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'consenting')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'shift-a', tonight.performanceId, 'CONFIRMED', who)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: true, name: 'Someone consenting', phone: '07700 900000' })
    })
  })

  test('a confirmed holder who has not consented shows their name but not their phone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'quiet')
      shift(database, 'shift-b', tonight.performanceId, 'CONFIRMED', who)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: true, name: 'Someone quiet', phone: null })
    })
  })

  test('an open shift reads as unfilled, never a blank name', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      shift(database, 'shift-c', tonight.performanceId, 'OPEN', null)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: false, name: null, phone: null })
    })
  })

  test('a cancelled shift does not appear at all', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'gone')
      shift(database, 'shift-d', tonight.performanceId, 'CANCELLED', who)

      expect(read(database, tonightTeamQuery(tonight.performanceId))).toHaveLength(0)
    })
  })
})

describe('the performance a screen is asked about', () => {
  test('carries the show\'s latecomer policy and age guidance', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      database.batch([['UPDATE shows SET latecomer_policy = ?, age_guidance = ? WHERE id = ?',
        'AT_INTERVAL', 'Contains strobe lighting', tonight.showId]])

      const [row] = read<{ latecomerPolicy: string, ageGuidance: string, venueName: string }>(
        database, tonightPerformanceQuery(tonight.performanceId))
      expect(row).toMatchObject({ latecomerPolicy: 'AT_INTERVAL', ageGuidance: 'Contains strobe lighting' })
    })
  })
})
