import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { refundTicket } from '#server/utils/refunds'
import { OWN_BOOKING_REFUND } from '#shared/utils/self-dealing'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-116 criterion 7, 0116: nobody refunds a ticket on a booking in their own name. The ticket's
// claim carries the refusal, so no ledger entry or audit row follows a refused refund either.

let database: TestDatabase
let performanceId: string

beforeEach(async () => {
  database = await createTestDatabase()
  ticketTypeFixture(database)
  performanceId = tonightsPerformance(database).performanceId
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'The Front of House Manager'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-patron', 'patron@example.invalid', 'A patron'],
  ])
  bindD1(database)
})

afterEach(() => {
  database.close()
})

function collected(reservationId: string, holderId: string): string {
  const ticketId = `${reservationId}-ticket`
  database.batch([
    ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
      reservationId, reservationId.toUpperCase(), performanceId, holderId, 'COLLECTED', 'DESK'],
    ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
      ticketId, reservationId, performanceId, 'tt-standard', 900, 'BASE'],
  ])
  return ticketId
}

const refundOf = (reservationId: string, ticketId: string) => refundTicket({
  reservationId,
  ticketId,
  pricePaid: 900,
  actorId: 'u-officer',
  performanceId,
})

const refundedAt = (ticketId: string): number | null | undefined =>
  rows<{ refundedAt: number | null }>(database, 'SELECT refunded_at AS refundedAt FROM tickets WHERE id = ?', ticketId)[0]?.refundedAt

const refundLines = (ticketId: string): unknown[] =>
  rows(database, `SELECT id FROM ledger_lines WHERE ticket_id = ? AND kind = 'REFUND'`, ticketId)

const refundAudits = (reservationId: string): unknown[] =>
  rows(database, `SELECT id FROM audit_log WHERE action = 'ticket.refunded' AND target = ?`, `reservation:${reservationId}`)

describe('a refunder never refunds their own booking (D-116 criterion 7, 0116)', () => {
  test('a ticket on a booking in the refunder\'s own name is refused, naming who can, and nothing is written', async () => {
    const ticketId = collected('own-1', 'u-officer')

    await expect(refundOf('own-1', ticketId)).rejects.toMatchObject({ statusCode: 403, statusMessage: OWN_BOOKING_REFUND })

    expect(refundedAt(ticketId)).toBeNull()
    expect(refundLines(ticketId)).toEqual([])
    expect(refundAudits('own-1')).toEqual([])
  })

  test('the same refunder refunds a ticket on somebody else\'s booking', async () => {
    const ticketId = collected('theirs-1', 'u-patron')

    const result = await refundOf('theirs-1', ticketId)

    expect(result.applied).toBe(true)
    expect(refundedAt(ticketId)).not.toBeNull()
    expect(refundLines(ticketId)).toHaveLength(1)
    expect(refundAudits('theirs-1')).toHaveLength(1)
  })

  test('a ticket already refunded on somebody else\'s booking still answers as not applied', async () => {
    const ticketId = collected('theirs-2', 'u-patron')
    await refundOf('theirs-2', ticketId)

    expect((await refundOf('theirs-2', ticketId)).applied).toBe(false)
    expect(refundLines(ticketId)).toHaveLength(1)
  })
})
