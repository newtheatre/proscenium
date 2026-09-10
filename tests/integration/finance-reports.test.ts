import { describe, expect, test } from 'bun:test'
import { accessAdmissionsQuery, foregoneQuery } from '#server/utils/finance-reports'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// I-103 against the real migrations: foregone value and access/companion admissions, read fresh
// from the ledger by show or by period, never a stored total.

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

// A performance the fixture does not itself provide, sharing a show it did create.
function secondPerformance(database: TestDatabase, id: string, showId: string, venueId: string, startsAt: number): void {
  database.batch([[
    `INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, 'ON_SALE')`,
    id, showId, venueId, startsAt,
  ]])
}

function entry(database: TestDatabase, id: string, tender: string, happenedAt: number, day: string, source = 'DESK'): void {
  database.batch([['INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, total_pence) VALUES (?, ?, ?, ?, ?, 0)',
    id, happenedAt, day, source, tender]])
}

// BAR_ITEM, not TICKET_COLLECTION: D-114's own trigger refuses a TICKET_COLLECTION line with no
// collected reservation behind it, and these tests exercise the foregone total generically.
function compLine(database: TestDatabase, id: string, entryId: string, performanceId: string, unitPricePence: number): void {
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, unit_price_pence, performance_id) VALUES (?, ?, ?, 0, ?, ?)',
    id, entryId, 'BAR_ITEM', unitPricePence, performanceId]])
}

function discountLine(database: TestDatabase, id: string, entryId: string, performanceId: string, amountPence: number, discountPence: number): void {
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, discount_pence, performance_id) VALUES (?, ?, ?, ?, ?, ?)',
    id, entryId, 'BAR_ITEM', amountPence, discountPence, performanceId]])
}

describe('foregone value by show (criterion 1)', () => {
  test('sums across every performance of the show, scoped by a subquery, and never another show', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      secondPerformance(database, 'performance-a2', tonight.showId, tonight.venueId, tonight.startsAt + 86400)
      const elsewhere = tonightsPerformance(database, { suffix: 'b' })

      entry(database, 'e-comp-a1', 'COMP', tonight.startsAt, '2026-09-10')
      compLine(database, 'l-comp-a1', 'e-comp-a1', tonight.performanceId, 900)

      entry(database, 'e-discount-a2', 'CARD', tonight.startsAt, '2026-09-10')
      discountLine(database, 'l-discount-a2', 'e-discount-a2', 'performance-a2', 800, 100)

      entry(database, 'e-comp-b', 'COMP', elsewhere.startsAt, '2026-09-10')
      compLine(database, 'l-comp-b', 'e-comp-b', elsewhere.performanceId, 500)

      const [row] = read<{ compsPence: number, compCount: number, discountsPence: number, discountCount: number }>(
        database, foregoneQuery({ scope: 'SHOW', showId: tonight.showId }))
      expect(row).toMatchObject({ compsPence: 900, compCount: 1, discountsPence: 100, discountCount: 1 })
    })
  })
})

describe('foregone value by period (criterion 1)', () => {
  test('sums across the whole ledger inside the London range, whichever show or module posted it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const inRange = Math.floor(new Date('2026-09-15T20:00:00Z').getTime() / 1000)
      const outOfRange = Math.floor(new Date('2026-09-20T20:00:00Z').getTime() / 1000)

      entry(database, 'e-comp-in', 'COMP', inRange, '2026-09-15', 'TILL')
      compLine(database, 'l-comp-in', 'e-comp-in', tonight.performanceId, 450)
      entry(database, 'e-comp-out', 'COMP', outOfRange, '2026-09-20', 'TILL')
      compLine(database, 'l-comp-out', 'e-comp-out', tonight.performanceId, 999)

      const [row] = read<{ compsPence: number }>(
        database, foregoneQuery({ scope: 'PERIOD', from: '2026-09-14', to: '2026-09-16' }))
      expect(row?.compsPence).toBe(450)
    })
  })

  // Criterion 5: a comp is a real, reportable figure, and it is still true that nothing about it
  // moves the reader's own CARD total for the day, which is what the SumUp Z will one day check.
  test('a day of comps carries real foregone value and moves nothing on the card total', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const happenedAt = Math.floor(new Date('2026-09-15T20:00:00Z').getTime() / 1000)
      entry(database, 'e-comp-1', 'COMP', happenedAt, '2026-09-15')
      compLine(database, 'l-comp-1', 'e-comp-1', tonight.performanceId, 900)
      entry(database, 'e-comp-2', 'COMP', happenedAt, '2026-09-15')
      compLine(database, 'l-comp-2', 'e-comp-2', tonight.performanceId, 700)

      const scope = { scope: 'PERIOD' as const, from: '2026-09-15', to: '2026-09-15' }
      const [foregone] = read<{ compsPence: number }>(database, foregoneQuery(scope))
      expect(foregone?.compsPence).toBe(1600)

      const [card] = rows<{ total: number | null }>(database,
        `SELECT sum(ll.amount_pence) AS total FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id WHERE le.tender = 'CARD' AND le.london_day = ?`,
        '2026-09-15')
      expect(card?.total ?? 0).toBe(0)
    })
  })
})

describe('access and companion admissions (criterion 3)', () => {
  function accessTicketType(database: TestDatabase, id: string, accessKind: 'ACCESS' | 'COMPANION'): void {
    database.batch([['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, 0, ?, ?)',
      id, `An ${accessKind} type`, 'SINGLE', accessKind]])
  }

  function reservationAndTicket(database: TestDatabase, id: string, performanceId: string, ticketTypeId: string): void {
    database.batch([
      ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
        `r-${id}`, id.toUpperCase().slice(0, 6), performanceId, 'COLLECTED', 'WEB'],
      ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, 0, ?)',
        id, `r-${id}`, performanceId, ticketTypeId, 'BASE'],
    ])
  }

  test('counts and totals an access admission without joining a need or a name', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      accessTicketType(database, 'tt-access', 'ACCESS')
      reservationAndTicket(database, 't-access-1', tonight.performanceId, 'tt-access')
      database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, total_pence) VALUES (?, ?, ?, ?, 0)',
        'e-access', '2026-09-10', 'DESK', 'CARD']])
      database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, performance_id, ticket_id) VALUES (?, ?, ?, 0, ?, ?)',
        'l-access', 'e-access', 'TICKET_COLLECTION', tonight.performanceId, 't-access-1']])

      const rowsFound = read<{ accessKind: string, count: number, valuePence: number }>(
        database, accessAdmissionsQuery({ scope: 'SHOW', showId: tonight.showId }))
      expect(rowsFound).toEqual([{ accessKind: 'ACCESS', count: 1, valuePence: 0 }])
    })
  })

  test('an ordinary ticket type never appears here', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reservationAndTicket(database, 't-standard-1', tonight.performanceId, 'tt-standard')
      database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, total_pence) VALUES (?, ?, ?, ?, 900)',
        'e-standard', '2026-09-10', 'DESK', 'CARD']])
      database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, performance_id, ticket_id) VALUES (?, ?, ?, 900, ?, ?)',
        'l-standard', 'e-standard', 'TICKET_COLLECTION', tonight.performanceId, 't-standard-1']])

      const rowsFound = read<{ accessKind: string }>(database, accessAdmissionsQuery({ scope: 'SHOW', showId: tonight.showId }))
      expect(rowsFound).toEqual([])
    })
  })
})
