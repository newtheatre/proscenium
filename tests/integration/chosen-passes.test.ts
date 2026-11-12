import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { passAdmissionTicketInsert } from '#server/utils/capacity'
import { cancelHeldOnPassSql, chosenPassInsert, chosenSeatAssertion, clearPassHoldsSql, endUnpaidPassStatement, lapsingUnpaidPassesQuery } from '#server/utils/pass-choice'
import { passAdmissionAllows, unpaidPassForReservationQuery } from '#server/utils/pass-redemption'
import { passCapAllows } from '#server/utils/pass-types'
import { passOffersQuery } from '#server/utils/passes'
import { owedPassSql, uncoveredBookingQuery } from '#server/utils/till-pass'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { ResolvedTillPass } from '#server/utils/till-pass'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-139 and D-140 on the real migrations (0261): a pass chosen while booking is unpaid, holds its
// seat, holds no place under the cap, and is paid, dropped or lapsed in one batch each.

const NOW = Math.floor(Date.now() / 1000)
const HOLD = NOW + 3_600

interface Tonight { performanceId: string, showId: string }

async function withDatabase(fn: (database: TestDatabase, tonight: Tonight) => void | Promise<void>, capacity = 120): Promise<void> {
  const database = await createTestDatabase()
  try {
    const tonight = tonightsPerformance(database, { venueCapacity: capacity })
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-seller', 'seller@example.invalid', 'Seller'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-holder', 'holder@example.invalid', 'Holder'],
      ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-pass', 'Pass admission', 0, 'PASS_ADMISSION'],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, max_issued, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'pt-1', 'season-pass', 'Season pass', 0, 4_102_444_800, 1, 'ON_SALE'],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1s', 'pt-1', 'Student', 3000],
      ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'cover-1', 'pt-1', tonight.showId],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
        'pt-2', 'other-pass', 'Other pass', 0, 4_102_444_800, 'ON_SALE'],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-2', 'pt-2', 'Standard', 2000],
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

const chosen = { passId: 'pass-1', reference: 'PASS23', passTypeId: 'pt-1', passTypePriceId: 'price-1', userId: 'u-holder', pricePence: 4500 }

// `redeemPass`'s own first three writes, held behind the chosen pass and ahead of the assertion.
function chooseStatements(tonight: Tonight, reservationId: string, ticketId: string, capacity: number): SQL[] {
  return [
    chosenPassInsert(chosen),
    sql`
      INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at)
      VALUES (${reservationId}, ${reservationId.toUpperCase().slice(0, 6)}, ${tonight.performanceId}, 'u-holder', 'PENDING', 'WEB', 0,
        CASE WHEN EXISTS (SELECT 1 FROM passes WHERE id = 'pass-1' AND paid = 0) THEN ${HOLD} ELSE NULL END)
    `,
    passAdmissionTicketInsert(
      { id: ticketId, reservationId, performanceId: tonight.performanceId, ticketTypeId: 'tt-pass', pricePaid: 0, priceSource: 'BASE' },
      passAdmissionAllows('pass-1', tonight.performanceId, tonight.showId, NOW),
      capacity,
    ),
    sql`
      INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id, admitted_by)
      SELECT ${`admission-${ticketId}`}, 'pass-1', ${tonight.performanceId}, ${ticketId}, NULL WHERE changes() = 1
    `,
    chosenSeatAssertion(reservationId, tonight.performanceId, 'u-holder', ticketId),
  ]
}

function owed(over: Partial<ResolvedTillPass> = {}): ResolvedTillPass {
  return {
    passId: 'pass-1',
    reference: 'PASS23',
    passTypeId: 'pt-1',
    passTypeName: 'Season pass',
    passTypePriceId: 'price-1s',
    priceLabel: 'Student',
    pricePence: 3000,
    maxIssued: 1,
    buyer: { id: 'u-holder', name: 'Holder' },
    requestId: null,
    swap: null,
    keptBooking: null,
    settle: true,
    ...over,
  }
}

function anEntry(database: TestDatabase, id: string): void {
  database.batch([[
    'INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, 1_780_000_000, '2026-10-21', 'TILL', 'CARD', 'u-seller', 3000,
  ]])
}

function paidPass(database: TestDatabase, id: string, userId: string): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', userId, `${userId}@example.invalid`, userId],
    ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, id.toUpperCase().slice(0, 6), 'pt-1', 'price-1', userId, 4500, 'ACTIVE', 'u-seller'],
  ])
}

describe('choosing a pass makes the unpaid pass and its seat together (D-139 criterion 1)', () => {
  test('the pass is unpaid at the chosen price, with no issuer, and its seat is held', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      const [pass] = rows<{ paid: number, pricePaid: number, issuedBy: string | null }>(database,
        'SELECT paid, price_paid AS pricePaid, issued_by AS issuedBy FROM passes WHERE id = ?', 'pass-1')
      expect(pass).toEqual({ paid: 0, pricePaid: 4500, issuedBy: null })
      const [booking] = rows<{ holdExpiresAt: number | null }>(database, 'SELECT hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', 'res-1')
      expect(booking?.holdExpiresAt).toBe(HOLD)
    })
  })

  test('a full house refuses the whole batch, so no pass is left without its seat', async () => {
    await withDatabase((database, tonight) => {
      expect(() => run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 0))).toThrow(/reservations\.id/)
      expect(rows<{ total: number }>(database, 'SELECT count(*) AS total FROM passes')[0]?.total).toBe(0)
      expect(rows<{ total: number }>(database, 'SELECT count(*) AS total FROM reservations')[0]?.total).toBe(0)
    })
  })

  test('a holder who already has this pass is refused, and nothing is written', async () => {
    await withDatabase((database, tonight) => {
      database.batch([['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'pass-held', 'HELD23', 'pt-1', 'price-1', 'u-holder', 4500, 'ACTIVE', 'u-seller']])
      expect(() => run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))).toThrow(/reservations\.id/)
      expect(rows<{ total: number }>(database, 'SELECT count(*) AS total FROM passes')[0]?.total).toBe(1)
    })
  })

  test('the booking names the pass it owes, until it is paid (0261)', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      const [due] = rows<{ passId: string, pricePence: number }>(database, ...boundStatement(database, unpaidPassForReservationQuery('res-1')))
      expect(due).toMatchObject({ passId: 'pass-1', pricePence: 4500 })
      anEntry(database, 'entry-1')
      run(database, owedPassSql(owed(), 'entry-1', 'u-seller'))
      expect(rows(database, ...boundStatement(database, unpaidPassForReservationQuery('res-1')))).toEqual([])
    })
  })
})

describe('an unpaid pass holds no place under the cap (D-139 criterion 3)', () => {
  test('the cap predicate and the booking page\'s offer both count paid passes only', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      const [allows] = rows<{ allowed: number }>(database, ...boundStatement(database, sql`SELECT ${passCapAllows('pt-1', 1)} AS allowed`))
      expect(allows?.allowed).toBe(1)
      const offered = rows<{ id: string }>(database, ...boundStatement(database, passOffersQuery(tonight.showId, null, NOW)))
      expect(offered.map(offer => offer.id)).toContain('pt-1')
    })
  })
})

describe('the till takes the money for a chosen pass (D-140)', () => {
  test('paying marks it paid at the charged price, names the seller and clears the hold (criterion 3)', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      anEntry(database, 'entry-1')
      run(database, owedPassSql(owed(), 'entry-1', 'u-seller'))
      const [pass] = rows<{ paid: number, pricePaid: number, priceId: string, issuedBy: string }>(database,
        'SELECT paid, price_paid AS pricePaid, pass_type_price_id AS priceId, issued_by AS issuedBy FROM passes WHERE id = ?', 'pass-1')
      expect(pass).toEqual({ paid: 1, pricePaid: 3000, priceId: 'price-1s', issuedBy: 'u-seller' })
      const [booking] = rows<{ holdExpiresAt: number | null }>(database, 'SELECT hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', 'res-1')
      expect(booking?.holdExpiresAt).toBeNull()
      expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'pass.paid')).toHaveLength(1)
    })
  })

  test('a pass no longer owed is refused, so a second charge for it rolls back', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      anEntry(database, 'entry-1')
      run(database, owedPassSql(owed(), 'entry-1', 'u-seller'))
      anEntry(database, 'entry-2')
      expect(() => run(database, owedPassSql(owed({ maxIssued: null }), 'entry-2', 'u-seller'))).toThrow(/passes\.id/)
    })
  })

  test('the cap is asserted at payment (criterion 3)', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      paidPass(database, 'pass-other', 'u-other')
      anEntry(database, 'entry-1')
      expect(() => run(database, owedPassSql(owed(), 'entry-1', 'u-seller'))).toThrow(/passes\.id/)
      expect(rows<{ paid: number }>(database, 'SELECT paid FROM passes WHERE id = ?', 'pass-1')[0]?.paid).toBe(0)
    })
  })

  test('another pass type must cover every live booking on the pass (criterion 2)', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      expect(rows<{ showTitle: string }>(database, ...boundStatement(database, uncoveredBookingQuery('pass-1', 'pt-2')))).toEqual([{ showTitle: 'A Test Show' }])
      expect(rows(database, ...boundStatement(database, uncoveredBookingQuery('pass-1', 'pt-1')))).toEqual([])
    })
  })
})

describe('an unpaid pass ends with its held bookings (D-140 criterion 4, D-139 criterion 4)', () => {
  test('dropping it cancels the pass and every booking still held on it', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      const entry = auditEntry({ actorId: 'u-seller', action: 'pass.dropped', target: 'pass:pass-1' })
      run(database, [
        endUnpaidPassStatement('pass-1', 'CANCELLED'),
        sql`INSERT INTO audit_log (id, actor_id, action, target) SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target} WHERE changes() = 1`,
        cancelHeldOnPassSql('pass-1', entry),
      ])
      expect(rows<{ status: string }>(database, 'SELECT status FROM passes WHERE id = ?', 'pass-1')[0]?.status).toBe('CANCELLED')
      expect(rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', 'res-1')[0]?.status).toBe('CANCELLED')
    })
  })

  test('a paid pass is never dropped', async () => {
    await withDatabase((database) => {
      paidPass(database, 'pass-paid', 'u-other')
      const [query, ...parameters] = boundStatement(database, endUnpaidPassStatement('pass-paid', 'CANCELLED'))
      expect(database.raw.prepare(query).all(...parameters as never[])).toEqual([])
    })
  })

  test('the sweep lapses an unpaid pass once its sales window closes, and leaves a paid one', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      paidPass(database, 'pass-paid', 'u-other')
      expect(rows(database, ...boundStatement(database, lapsingUnpaidPassesQuery(NOW, 10)))).toEqual([])
      database.batch([['UPDATE pass_types SET sales_close_at = ? WHERE id = ?', NOW - 1, 'pt-1']])
      expect(rows<{ id: string }>(database, ...boundStatement(database, lapsingUnpaidPassesQuery(NOW, 10)))).toEqual([{ id: 'pass-1' }])
    })
  })

  test('paying clears the holds by subquery, and only on bookings still pending', async () => {
    await withDatabase((database, tonight) => {
      run(database, chooseStatements(tonight, 'res-1', 'ticket-1', 120))
      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'EXPIRED', 'res-1']])
      run(database, [clearPassHoldsSql('pass-1', sql`1 = 1`)])
      expect(rows<{ holdExpiresAt: number | null }>(database, 'SELECT hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', 'res-1')[0]?.holdExpiresAt).toBe(HOLD)
    })
  })
})
