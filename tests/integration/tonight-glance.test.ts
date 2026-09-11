import { describe, expect, test } from 'bun:test'
import { accessBookingsQuery, passPressureQuery } from '#server/utils/tonight-glance'
import { ticketInsertQueries } from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The glance's two blocks against the real migrations (E-112 criteria 1 and 6). What the wording
// then says is pinned in `tests/unit/night-hub.test.ts`; the decryption is D-127's own suite.

const NOW = 1_800_000_000

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    database.batch([['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)',
      'tt-access', 'Access', 900, 'SINGLE', 'ACCESS']])
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

function person(database: TestDatabase, id: string, name: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, name, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function reserve(database: TestDatabase, id: string, performanceId: string, userId: string, status = 'PENDING'): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, userId, status, 'WEB']])
}

function ticket(database: TestDatabase, id: string, performanceId: string, reservationId: string, ticketTypeId = 'tt-standard'): void {
  const [statement] = ticketInsertQueries([{ id, reservationId, performanceId, ticketTypeId, pricePaid: 900, priceSource: 'BASE' }], null)
  database.batch([boundStatement(database, statement!)])
}

function passType(database: TestDatabase, id: string, slug: string, showId: string | null): void {
  database.batch([
    ['INSERT INTO pass_types (id, slug, name, status, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?)',
      id, slug, slug, 'ON_SALE', NOW - 1000, NOW + 1000],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', `${id}-price`, id, 'Standard', 2000],
  ])
  if (showId) database.batch([['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${id}-${showId}`, id, showId]])
}

function issuePass(database: TestDatabase, id: string, typeId: string, userId: string, status = 'ACTIVE'): void {
  database.batch([['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), typeId, `${typeId}-price`, userId, 2000, status, userId]])
}

function covering(database: TestDatabase, performanceId: string, showId: string): number {
  const [row] = read<{ covering: number }>(database, passPressureQuery(performanceId, showId, NOW))
  return row?.covering ?? 0
}

describe('pass pressure counts what could still walk in (E-112 criterion 1)', () => {
  test('a live pass covering this show is pressure', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      passType(database, 'pt-season', 'season', tonight.showId)
      issuePass(database, 'pass-1', 'pt-season', person(database, 'u-1', 'Maid Marian'))
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(1)
    })
  })

  test('a fellowship covers everything the theatre puts on, named show or not', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      passType(database, 'pt-fellow', 'fellowship', null)
      issuePass(database, 'pass-f', 'pt-fellow', person(database, 'u-f', 'Friar Tuck'))
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(1)
    })
  })

  test('a pass for another show is not pressure on this one', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const other = tonightsPerformance(database, { suffix: 'b' })
      passType(database, 'pt-other', 'other', other.showId)
      issuePass(database, 'pass-o', 'pt-other', person(database, 'u-o', 'Will Scarlet'))
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(0)
    })
  })

  test('a cancelled pass and a closed pass type are both gone', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      passType(database, 'pt-season', 'season', tonight.showId)
      issuePass(database, 'pass-x', 'pt-season', person(database, 'u-x', 'Little John'), 'CANCELLED')
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(0)
      database.batch([['UPDATE pass_types SET status = ? WHERE id = ?', 'CLOSED', 'pt-season']])
      issuePass(database, 'pass-y', 'pt-season', person(database, 'u-y', 'Alan a Dale'))
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(0)
    })
  })

  test('a pass already admitted tonight is no longer pressure', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      passType(database, 'pt-season', 'season', tonight.showId)
      const holder = person(database, 'u-a', 'Maid Marian')
      issuePass(database, 'pass-a', 'pt-season', holder)
      reserve(database, 'r-a', tonight.performanceId, holder, 'DOOR')
      ticket(database, 't-a', tonight.performanceId, 'r-a')
      database.batch([['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)',
        'adm-a', 'pass-a', tonight.performanceId, 't-a']])
      expect(covering(database, tonight.performanceId, tonight.showId)).toBe(0)
    })
  })
})

describe('access tonight names only the bookings that hold an access ticket (E-112 criterion 6)', () => {
  test('an access booking is listed with its whole party', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const booker = person(database, 'u-access', 'Sam Hale')
      reserve(database, 'r-access', tonight.performanceId, booker, 'PENDING')
      ticket(database, 't-access', tonight.performanceId, 'r-access', 'tt-access')
      ticket(database, 't-companion', tonight.performanceId, 'r-access')
      expect(read(database, accessBookingsQuery(tonight.performanceId)))
        .toEqual([{ userId: booker, name: 'Sam Hale', party: 2 }])
    })
  })

  test('an ordinary booking is never listed, whatever else it holds', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const booker = person(database, 'u-plain', 'Plain Booker')
      reserve(database, 'r-plain', tonight.performanceId, booker, 'COLLECTED')
      ticket(database, 't-plain', tonight.performanceId, 'r-plain')
      expect(read(database, accessBookingsQuery(tonight.performanceId))).toEqual([])
    })
  })

  test('a cancelled booking has nobody arriving, so it is not on the list', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const booker = person(database, 'u-gone', 'Gone Away')
      reserve(database, 'r-gone', tonight.performanceId, booker, 'CANCELLED')
      ticket(database, 't-gone', tonight.performanceId, 'r-gone', 'tt-access')
      expect(read(database, accessBookingsQuery(tonight.performanceId))).toEqual([])
    })
  })

  test('the other performance of the day is a different list (E-127 criterion 1)', async () => {
    await withDatabase((database) => {
      const matinee = tonightsPerformance(database)
      const evening = tonightsPerformance(database, { suffix: 'b' })
      const booker = person(database, 'u-mat', 'Matinee Only')
      reserve(database, 'r-mat', matinee.performanceId, booker, 'PENDING')
      ticket(database, 't-mat', matinee.performanceId, 'r-mat', 'tt-access')
      expect(read(database, accessBookingsQuery(matinee.performanceId))).toHaveLength(1)
      expect(read(database, accessBookingsQuery(evening.performanceId))).toEqual([])
    })
  })
})
