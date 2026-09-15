import { describe, expect, test } from 'bun:test'
import {
  cardSalesQuery,
  compsQuery,
  discountsQuery,
  tabChargesQuery,
  tabSettlementsQuery,
  ticketsAtTheBarQuery,
} from '#server/utils/reconciliation'
import { closeSessionStatement } from '#server/utils/till'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Two bars running one night each reconcile to their own figure, never the estate's combined one
// (F-118 criterion 3, F-202 criterion 3). The scope is the session an entry was rung up against.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
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
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

let entrySeq = 0
let lineSeq = 0

// happenedAt is always stamped explicitly: a night's window is a fact about the row, never about
// when the test happened to run, the discipline reconciliation.test.ts keeps beside this file.
function entry(database: TestDatabase, over: {
  source: string
  tender: string
  happenedAt: number
  sessionId?: string | null
  totalPence?: number
}): string {
  const id = `e-${++entrySeq}`
  database.batch([[
    `INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, till_session_id, total_pence)
     VALUES (?, '2026-01-05', ?, ?, ?, ?, ?)`,
    id, over.source, over.tender, over.happenedAt, over.sessionId ?? null, over.totalPence ?? 0,
  ]])
  return id
}

function line(database: TestDatabase, entryId: string, over: {
  kind: string
  amountPence: number
  qty?: number
  unitPricePence?: number
  discountId?: string | null
  discountPence?: number | null
}): void {
  database.batch([[
    `INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, discount_id, discount_pence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    `l-${++lineSeq}`, entryId, over.kind, over.amountPence, over.qty ?? 1, over.unitPricePence ?? null,
    over.discountId ?? null, over.discountPence ?? null,
  ]])
}

// A plain night, safely clear of any DST transition, the same fixture constant F-118's own suite uses.
const NIGHT = '2026-01-05'
const FROM_AT = Math.floor(Date.UTC(2026, 0, 5, 4, 0, 0) / 1000)

interface TwoBars { mainVenueId: string, studioVenueId: string, mainSessionId: string, studioSessionId: string }

// Two venues both selling over the bar the same night, each with its own open session.
function twoBars(database: TestDatabase): TwoBars {
  const opener = person(database, 'opener')
  const main = testVenue(database, { suffix: 'main', name: 'The Main House' })
  const studio = testVenue(database, { suffix: 'studio', name: 'The Studio' })
  database.batch([
    ['INSERT INTO till_sessions (id, venue_id, night, opened_by, opened_at) VALUES (?, ?, ?, ?, ?)',
      'session-main', main.id, NIGHT, opener, FROM_AT],
    ['INSERT INTO till_sessions (id, venue_id, night, opened_by, opened_at) VALUES (?, ?, ?, ?, ?)',
      'session-studio', studio.id, NIGHT, opener, FROM_AT],
  ])
  return { mainVenueId: main.id, studioVenueId: studio.id, mainSessionId: 'session-main', studioSessionId: 'session-studio' }
}

describe('card sales scope to one session, or to one venue\'s sessions (F-202 criterion 3)', () => {
  test('each bar reads its own takings, never the other\'s', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const main = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, main, { kind: 'BAR_ITEM', amountPence: 500 })
      const studio = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, sessionId: bars.studioSessionId })
      line(database, studio, { kind: 'BAR_ITEM', amountPence: 300 })

      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { sessionId: bars.mainSessionId }))[0])
        .toMatchObject({ cardSalesPence: 500 })
      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { sessionId: bars.studioSessionId }))[0])
        .toMatchObject({ cardSalesPence: 300 })
    })
  })

  test('a venue predicate reads every session that venue ran tonight', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const opener = person(database, 'opener')
      // A second session at the same bar is allowed only once the first has closed, which is
      // what the partial unique on (venue, night) says (F-102 criterion 1).
      database.batch([['INSERT INTO till_sessions (id, venue_id, night, opened_by, opened_at, closed_by, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'session-main-earlier', bars.mainVenueId, NIGHT, opener, FROM_AT - 3600, opener, FROM_AT - 60]])
      const first = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, first, { kind: 'BAR_ITEM', amountPence: 500 })
      const second = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 30, sessionId: 'session-main-earlier' })
      line(database, second, { kind: 'BAR_ITEM', amountPence: 250 })
      const elsewhere = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, sessionId: bars.studioSessionId })
      line(database, elsewhere, { kind: 'BAR_ITEM', amountPence: 300 })

      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { venueId: bars.mainVenueId }))[0])
        .toMatchObject({ cardSalesPence: 750 })
    })
  })

  test('an entry naming no session is excluded once a filter is given', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const named = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, named, { kind: 'BAR_ITEM', amountPence: 500 })
      const orphan = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 90 })
      line(database, orphan, { kind: 'BAR_ITEM', amountPence: 900 })

      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { sessionId: bars.mainSessionId }))[0])
        .toMatchObject({ cardSalesPence: 500 })
      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { venueId: bars.mainVenueId }))[0])
        .toMatchObject({ cardSalesPence: 500 })
    })
  })

  test('no filter still sums the whole night, session-less rows included', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const main = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, main, { kind: 'BAR_ITEM', amountPence: 500 })
      const studio = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, sessionId: bars.studioSessionId })
      line(database, studio, { kind: 'BAR_ITEM', amountPence: 300 })
      const orphan = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 90 })
      line(database, orphan, { kind: 'BAR_ITEM', amountPence: 900 })

      expect(read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))[0]).toMatchObject({ cardSalesPence: 1700 })
    })
  })
})

describe('every figure on the close screen narrows the same way (F-118 criterion 2)', () => {
  test('tickets, tab settlements, comps, discounts and tab charges each answer for one session', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const mine = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, mine, { kind: 'WALK_UP', amountPence: 900 })
      line(database, mine, { kind: 'TAB_SETTLEMENT', amountPence: 1500 })
      line(database, mine, { kind: 'BAR_ITEM', amountPence: 400, discountId: 'd-1', discountPence: 100 })
      const myComp = entry(database, { source: 'TILL', tender: 'COMP', happenedAt: FROM_AT + 70, sessionId: bars.mainSessionId })
      line(database, myComp, { kind: 'BAR_ITEM', amountPence: 0, qty: 2, unitPricePence: 350 })
      entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 80, sessionId: bars.mainSessionId, totalPence: 600 })

      const theirs = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 160, sessionId: bars.studioSessionId })
      line(database, theirs, { kind: 'WALK_UP', amountPence: 1100 })
      line(database, theirs, { kind: 'TAB_SETTLEMENT', amountPence: 2000 })
      line(database, theirs, { kind: 'BAR_ITEM', amountPence: 700, discountId: 'd-2', discountPence: 300 })
      const theirComp = entry(database, { source: 'TILL', tender: 'COMP', happenedAt: FROM_AT + 170, sessionId: bars.studioSessionId })
      line(database, theirComp, { kind: 'BAR_ITEM', amountPence: 0, qty: 1, unitPricePence: 500 })
      entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 180, sessionId: bars.studioSessionId, totalPence: 1200 })

      const scope = { sessionId: bars.mainSessionId }
      expect(read<{ ticketsPence: number }>(database, ticketsAtTheBarQuery(NIGHT, scope))[0]).toMatchObject({ ticketsPence: 900 })
      expect(read<{ tabSettlementsPence: number }>(database, tabSettlementsQuery(NIGHT, scope))[0]).toMatchObject({ tabSettlementsPence: 1500 })
      expect(read<{ compsCount: number, compsForegonePence: number }>(database, compsQuery(NIGHT, scope))[0])
        .toMatchObject({ compsCount: 1, compsForegonePence: 700 })
      expect(read<{ discountsPence: number }>(database, discountsQuery(NIGHT, scope))[0]).toMatchObject({ discountsPence: 100 })
      expect(read<{ tabChargesPence: number }>(database, tabChargesQuery(NIGHT, scope))[0]).toMatchObject({ tabChargesPence: 600 })
    })
  })
})

describe('the close stamps the session\'s own figure (F-118 criterion 3)', () => {
  test('two sessions at two venues on one night each record their own expected total', async () => {
    await withDatabase((database) => {
      const bars = twoBars(database)
      const closer = person(database, 'closer')
      const main = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, sessionId: bars.mainSessionId })
      line(database, main, { kind: 'BAR_ITEM', amountPence: 500 })
      const studio = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, sessionId: bars.studioSessionId })
      line(database, studio, { kind: 'BAR_ITEM', amountPence: 300 })

      const expectedFor = (sessionId: string): number =>
        read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT, { sessionId }))[0]!.cardSalesPence

      for (const [sessionId, venueId] of [[bars.mainSessionId, bars.mainVenueId], [bars.studioSessionId, bars.studioVenueId]] as const) {
        const expectedPence = expectedFor(sessionId)
        const statement = closeSessionStatement({
          id: sessionId,
          venueId,
          night: NIGHT,
          closedBy: closer,
          expectedPence,
          actualZPence: expectedPence,
          variancePence: 0,
          varianceNote: null,
        })
        expect(read<{ id: string }>(database, statement)).toEqual([{ id: sessionId }])
      }

      const closed = rows<{ id: string, expected_total_pence: number }>(
        database, 'SELECT id, expected_total_pence FROM till_sessions ORDER BY id')
      expect(closed).toEqual([
        { id: bars.mainSessionId, expected_total_pence: 500 },
        { id: bars.studioSessionId, expected_total_pence: 300 },
      ])
    })
  })
})
