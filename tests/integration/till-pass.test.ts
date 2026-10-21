import { describe, expect, test } from 'bun:test'
import { swapDecision, swapSql, tillPassSql, tonightBookingQuery } from '#server/utils/till-pass'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { ResolvedTillPass, SwapCandidate } from '#server/utils/till-pass'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-134 on the real migrations: the pass the till issues, its cap, and tonight's booking moved
// onto it in one batch or not at all (0035).

interface Tonight { performanceId: string, showId: string }

async function withDatabase(fn: (database: TestDatabase, tonight: Tonight) => void | Promise<void>, capacity = 120): Promise<void> {
  const database = await createTestDatabase()
  try {
    const tonight = tonightsPerformance(database, { venueCapacity: capacity })
    ticketTypeFixture(database)
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-seller', 'seller@example.invalid', 'Seller'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-buyer', 'buyer@example.invalid', 'Buyer'],
      ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-pass', 'Pass admission', 0, 'PASS_ADMISSION'],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, max_issued, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'pt-1', 'season-pass', 'Season pass', 0, 4_102_444_800, 1, 'ON_SALE'],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
      ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'cover-1', 'pt-1', tonight.showId],
    ])
    await fn(database, tonight)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statements: SQL[]): void {
  database.batch(statements.map(statement => boundStatement(database, statement)))
}

function aPass(over: Partial<ResolvedTillPass> = {}): ResolvedTillPass {
  return {
    passId: 'pass-1',
    reference: 'PASS23',
    passTypeId: 'pt-1',
    passTypeName: 'Season pass',
    passTypePriceId: 'price-1',
    priceLabel: 'Standard',
    pricePence: 4500,
    maxIssued: 1,
    buyer: { id: 'u-buyer', name: 'Buyer' },
    requestId: null,
    swap: null,
    keptBooking: null,
    ...over,
  }
}

// The entry the sale's own batch posts first; the pass statements are gated on it.
function anEntry(database: TestDatabase, id: string): void {
  database.batch([[
    'INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, 1_780_000_000, '2026-10-21', 'TILL', 'CARD', 'u-seller', 4500,
  ]])
}

function aBooking(database: TestDatabase, id: string, performanceId: string, seats: number, status = 'PENDING'): void {
  database.batch([
    ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
      id, id.toUpperCase().slice(0, 6), performanceId, 'u-buyer', status, 'WEB'],
    ...Array.from({ length: seats }, (_, index) => [
      'INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
      `${id}-t${index}`, id, performanceId, 'tt-standard', 900, 'BASE',
    ] as [string, ...unknown[]]),
  ])
}

describe('the till issues a pass in the sale\'s own batch (D-134 criterion 1)', () => {
  test('under the cap it is issued to the buyer at the price paid', async () => {
    await withDatabase((database) => {
      anEntry(database, 'entry-1')
      run(database, tillPassSql(aPass(), 'entry-1', 'u-seller'))
      const [held] = rows<{ userId: string, pricePaid: number, issuedBy: string }>(database,
        'SELECT user_id AS userId, price_paid AS pricePaid, issued_by AS issuedBy FROM passes WHERE id = ?', 'pass-1')
      expect(held).toEqual({ userId: 'u-buyer', pricePaid: 4500, issuedBy: 'u-seller' })
    })
  })

  test('past the cap the assertion raises, so the whole batch is refused', async () => {
    await withDatabase((database) => {
      anEntry(database, 'entry-1')
      run(database, tillPassSql(aPass(), 'entry-1', 'u-seller'))
      anEntry(database, 'entry-2')
      expect(() => run(database, tillPassSql(aPass({ passId: 'pass-2', reference: 'PASS34' }), 'entry-2', 'u-seller'))).toThrow(/passes\.id/)
      expect(rows<{ total: number }>(database, 'SELECT count(*) AS total FROM passes')[0]?.total).toBe(1)
    })
  })

  test('the buyer\'s open request is fulfilled by the same sale (D-134 criterion 4)', async () => {
    await withDatabase((database) => {
      database.batch([['INSERT INTO pass_requests (id, pass_type_id, user_id) VALUES (?, ?, ?)', 'r-1', 'pt-1', 'u-buyer']])
      anEntry(database, 'entry-1')
      run(database, tillPassSql(aPass({ requestId: 'r-1' }), 'entry-1', 'u-seller'))
      const [request] = rows<{ status: string, passId: string }>(database, 'SELECT status, pass_id AS passId FROM pass_requests WHERE id = ?', 'r-1')
      expect(request).toEqual({ status: 'FULFILLED', passId: 'pass-1' })
    })
  })
})

describe('which of tonight\'s bookings moves onto the pass (D-134 criterion 3)', () => {
  test('a one-seat booking the pass covers moves', async () => {
    await withDatabase((database, tonight) => {
      aBooking(database, 'res-one', tonight.performanceId, 1)
      const found = rows<Parameters<typeof swapDecision>[0][number]>(database, ...boundStatement(database, tonightBookingQuery('u-buyer', tonight.performanceId, 'pt-1')))
      expect(swapDecision(found).swap?.reservationId).toBe('res-one')
    })
  })

  test('a party\'s booking stays as it is, and the receipt says so', async () => {
    await withDatabase((database, tonight) => {
      aBooking(database, 'res-two', tonight.performanceId, 2)
      const found = rows<Parameters<typeof swapDecision>[0][number]>(database, ...boundStatement(database, tonightBookingQuery('u-buyer', tonight.performanceId, 'pt-1')))
      const decided = swapDecision(found)
      expect(decided.swap).toBeNull()
      expect(decided.keptBooking).toContain('2 people')
    })
  })

  test('a booking already collected is not offered to move', async () => {
    await withDatabase((database, tonight) => {
      aBooking(database, 'res-paid', tonight.performanceId, 1, 'COLLECTED')
      const found = rows(database, ...boundStatement(database, tonightBookingQuery('u-buyer', tonight.performanceId, 'pt-1')))
      expect(found).toEqual([])
    })
  })
})

describe('moving tonight\'s booking onto the pass is one batch or nothing (D-134 criterion 3, 0035)', () => {
  function issued(database: TestDatabase): void {
    anEntry(database, 'entry-1')
    run(database, tillPassSql(aPass(), 'entry-1', 'u-seller'))
  }

  function swapOf(tonight: Tonight, reservationId: string): SwapCandidate {
    return { reservationId, reference: 'RESONE', performanceId: tonight.performanceId, showId: tonight.showId, showTitle: 'A Test Show' }
  }

  function swapBatch(database: TestDatabase, tonight: Tonight, reservationId: string, capacity: number | null): void {
    const { claim, assertion } = swapSql(swapOf(tonight, reservationId), {
      passId: 'pass-1', userId: 'u-buyer', reservationId: 'res-new', reference: 'NEWREF', ticketId: 'ticket-new', ticketTypeId: 'tt-pass', capacity, now: 1_780_000_000,
    })
    run(database, [...claim, assertion])
  }

  test('the old booking is cancelled pointing at the new one, and the pass holds the seat', async () => {
    await withDatabase((database, tonight) => {
      issued(database)
      aBooking(database, 'res-one', tonight.performanceId, 1)
      swapBatch(database, tonight, 'res-one', 120)
      const [old] = rows<{ status: string, to: string }>(database, 'SELECT status, exchanged_to_reservation_id AS "to" FROM reservations WHERE id = ?', 'res-one')
      expect(old).toEqual({ status: 'CANCELLED', to: 'res-new' })
      expect(rows(database, 'SELECT id FROM pass_admissions WHERE pass_id = ? AND ticket_id = ?', 'pass-1', 'ticket-new')).toHaveLength(1)
    })
  })

  test('into a full house the freed seat is the one the pass takes', async () => {
    await withDatabase((database, tonight) => {
      issued(database)
      aBooking(database, 'res-one', tonight.performanceId, 1)
      swapBatch(database, tonight, 'res-one', 1)
      expect(rows(database, 'SELECT id FROM tickets WHERE id = ?', 'ticket-new')).toHaveLength(1)
    })
  })

  test('a booking collected meanwhile leaves everything as it was', async () => {
    await withDatabase((database, tonight) => {
      issued(database)
      aBooking(database, 'res-one', tonight.performanceId, 1, 'COLLECTED')
      expect(() => swapBatch(database, tonight, 'res-one', 120)).toThrow(/reservations\.id/)
      expect(rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', 'res-one')[0]?.status).toBe('COLLECTED')
      expect(rows(database, 'SELECT id FROM reservations WHERE id = ?', 'res-new')).toEqual([])
      expect(rows(database, 'SELECT id FROM pass_admissions')).toEqual([])
    })
  })
})
