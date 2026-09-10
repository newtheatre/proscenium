import { describe, expect, test } from 'bun:test'
import {
  passUtilisationQuery,
  revenueByShowQuery,
  seasonTicketRevenueQuery,
  unattributedRevenueQuery,
} from '#server/utils/revenue-by-show'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// I-106 against the real migrations: collected, unrefunded ticket money only, grouped by the
// show every line keys to via its performance, never a subquery or a fetch repeated per show.

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

let entrySeq = 0
let lineSeq = 0
let ticketSeq = 0

function entry(database: TestDatabase, happenedAt: number, reverses: string | null = null): string {
  const id = `e-${++entrySeq}`
  database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, reverses_entry_id, total_pence) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, '2026-01-01', 'DESK', 'CARD', happenedAt, reverses, 0]])
  return id
}

// A real, collected ticket: D-114's own trigger refuses a TICKET_COLLECTION line against
// anything else, so `line()` below only reaches for one when the kind demands it.
function collectedTicket(database: TestDatabase, performanceId: string): string {
  const id = `t-${++ticketSeq}`
  database.batch([
    ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
      `r-${id}`, id.toUpperCase().slice(0, 6), performanceId, 'COLLECTED', 'WEB'],
    ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, 0, ?)',
      id, `r-${id}`, performanceId, 'tt-standard', 'BASE'],
  ])
  return id
}

function line(database: TestDatabase, entryId: string, kind: string, amountPence: number, performanceId: string | null): void {
  const ticketId = kind === 'TICKET_COLLECTION' && performanceId ? collectedTicket(database, performanceId) : null
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, performance_id, ticket_id) VALUES (?, ?, ?, ?, ?, ?)',
    `l-${++lineSeq}`, entryId, kind, amountPence, performanceId, ticketId]])
}

const AT = 1_800_000_000

describe('revenue by show, gross, refunded and net separately (criteria 1, 2, 3)', () => {
  test('a walk-up, a pre-booked collection and a refund attribute to the right show', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)

      const collection = entry(database, AT)
      line(database, collection, 'TICKET_COLLECTION', 900, tonight.performanceId)
      const walkUp = entry(database, AT + 60)
      line(database, walkUp, 'WALK_UP', 500, tonight.performanceId)
      const original = entry(database, AT + 120)
      line(database, original, 'TICKET_COLLECTION', 1200, tonight.performanceId)
      const refund = entry(database, AT + 180, original)
      line(database, refund, 'REFUND', -400, tonight.performanceId)

      const [row] = read<{ showId: string, grossPence: number, refundedPence: number, walkUpPence: number, preBookedPence: number }>(
        database, revenueByShowQuery(AT - 100, AT + 200))
      expect(row).toMatchObject({
        showId: tonight.showId,
        grossPence: 2600,
        refundedPence: 400,
        walkUpPence: 500,
        preBookedPence: 2100,
      })
    })
  })

  test('a reservation that never collected contributes nothing: no line is ever posted for it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      expect(read(database, revenueByShowQuery(AT - 100, AT + 200))).toEqual([])
      void tonight
    })
  })
})

describe('pass admissions report as counts against the show, never revenue (criterion 4)', () => {
  test('a pass admission posts at zero and is counted, not valued', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const admission = entry(database, AT)
      line(database, admission, 'PASS_ADMISSION', 0, tonight.performanceId)

      const [row] = read<{ passAdmissions: number, grossPence: number }>(database, revenueByShowQuery(AT - 100, AT + 200))
      expect(row).toMatchObject({ passAdmissions: 1, grossPence: 0 })
    })
  })
})

describe('a ticketing line with no performance link is its own bucket (the pre-#791/#795 gap)', () => {
  test('unattributed money is counted, never silently dropped', async () => {
    await withDatabase(async (database) => {
      const unlinked = entry(database, AT)
      line(database, unlinked, 'WALK_UP', 700, null)

      expect(read(database, revenueByShowQuery(AT - 100, AT + 200))).toEqual([])
      const [unattributed] = read<{ grossPence: number }>(database, unattributedRevenueQuery(AT - 100, AT + 200))
      expect(unattributed?.grossPence).toBe(700)
    })
  })
})

describe('the sum of per-show figures reconciles to the season total (criterion 5)', () => {
  test('per-show gross and refunded, plus the unattributed bucket, sum to the ungrouped season total', async () => {
    await withDatabase(async (database) => {
      const showA = tonightsPerformance(database, { suffix: 'a' })
      const showB = tonightsPerformance(database, { suffix: 'b' })

      const saleA = entry(database, AT)
      line(database, saleA, 'TICKET_COLLECTION', 900, showA.performanceId)
      const saleB = entry(database, AT + 60)
      line(database, saleB, 'WALK_UP', 500, showB.performanceId)
      const refundA = entry(database, AT + 120, saleA)
      line(database, refundA, 'REFUND', -300, showA.performanceId)
      const unlinked = entry(database, AT + 180)
      line(database, unlinked, 'WALK_UP', 250, null)

      const byShow = read<{ grossPence: number, refundedPence: number }>(database, revenueByShowQuery(AT - 100, AT + 200))
      const [unattributed] = read<{ grossPence: number, refundedPence: number }>(database, unattributedRevenueQuery(AT - 100, AT + 200))
      const [season] = read<{ grossPence: number, refundedPence: number }>(database, seasonTicketRevenueQuery(AT - 100, AT + 200))

      const summedGross = byShow.reduce((sum, row) => sum + row.grossPence, 0) + (unattributed?.grossPence ?? 0)
      const summedRefunded = byShow.reduce((sum, row) => sum + row.refundedPence, 0) + (unattributed?.refundedPence ?? 0)

      expect(summedGross).toBe(season?.grossPence)
      expect(summedRefunded).toBe(season?.refundedPence)
      expect(season).toEqual({ grossPence: 1650, refundedPence: 300 })
    })
  })
})

describe('pass utilisation, at pass level, never folded into a show (criterion 4)', () => {
  function passType(database: TestDatabase, id: string, showIds: string[]): void {
    database.batch([['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, 0, 9999999999)',
      id, id, `Pass ${id}`]])
    for (const showId of showIds) {
      database.batch([['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `pts-${id}-${showId}`, id, showId]])
    }
  }

  function issuedPass(database: TestDatabase, id: string, passTypeId: string, userId: string, createdAt: number): void {
    database.batch([
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', `${passTypeId}-price`, passTypeId, 'Standard', 1500],
      ['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', userId, `Someone ${userId}`, `${userId}@e2e.newtheatre.org.uk`],
      [`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, issued_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, id.toUpperCase(), passTypeId, `${passTypeId}-price`, userId, 1500, userId, createdAt],
    ])
  }

  test('utilisation counts distinct shows admitted to against every show the type covers', async () => {
    await withDatabase(async (database) => {
      const showA = tonightsPerformance(database, { suffix: 'a' })
      const showB = tonightsPerformance(database, { suffix: 'b' })
      passType(database, 'pt-1', [showA.showId, showB.showId])
      issuedPass(database, 'pass-1', 'pt-1', 'holder', AT)

      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
          'r-1', 'RESRV1', showA.performanceId, 'COLLECTED', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, 0, ?)',
          't-1', 'r-1', showA.performanceId, 'tt-standard', 'BASE'],
        ['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)', 'pa-1', 'pass-1', showA.performanceId, 't-1'],
      ])

      const [row] = read<{ passId: string, coveredShows: number, admittedShows: number }>(database, passUtilisationQuery(AT - 100, AT + 100))
      expect(row).toMatchObject({ passId: 'pass-1', coveredShows: 2, admittedShows: 1 })
    })
  })
})
