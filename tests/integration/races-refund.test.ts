import { describe, expect, test } from 'bun:test'
import { expectOneWinner, race } from '#tests/helpers/race'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// I-102 criterion 2, K-121: the double refund. Split from races-capacity.test.ts since it is a
// separate invariant on a separate table (K-105's own "split by invariant" convention).

// Mirrors server/utils/refunds.ts's exact shape: the ticket's own conditional claim is the
// arbiter, the ledger entry rides its `changes()`, and the line rides the entry's own existence.
// An in-process SQLite serialises these, so this proves the claim writes once, not that it is
// atomic under true concurrency (0022); the atomicity is `db.batch`'s own, unit-tested elsewhere.
function attemptRefund(database: TestDatabase, ticketId: string, reservationId: string, entryId: string, lineId: string, at: number): { status: number } {
  // One transaction, claim first: `changes()` here is SQLite's own, reading the immediately
  // preceding statement, exactly as `postEntry`'s `guard` parameter does in production.
  database.batch([
    ['UPDATE tickets SET refunded_at = ? WHERE id = ? AND reservation_id = ? AND refunded_at IS NULL', at, ticketId, reservationId],
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
      SELECT ?, ?, '2026-09-09', 'DESK', 'CARD', 'u-officer', -900
      WHERE changes() = 1`, entryId, at],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, reservation_id, ticket_id)
      SELECT ?, ?, 'REFUND', -900, 1, 900, ?, ?
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ?)`, lineId, entryId, reservationId, ticketId, entryId],
  ])

  const entry = rows<{ id: string }>(database, 'SELECT id FROM ledger_entries WHERE id = ?', entryId)
  return { status: entry.length > 0 ? 200 : 409 }
}

describe('the double refund: concurrent refunds of one ticket produce exactly one entry (I-102 criterion 2, K-121)', () => {
  test('two racing refunds leave exactly one ledger entry and one refunded ticket', async () => {
    const database = await createTestDatabase()
    try {
      ticketTypeFixture(database)
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'Officer'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-officer', 'COLLECTED', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
      ])

      const now = Math.floor(Date.now() / 1000)
      const answers = await race(2, async (index) =>
        attemptRefund(database, 't-1', 'r-1', `entry-${index}`, `line-${index}`, now))

      expectOneWinner(answers)

      const ticket = rows<{ refundedAt: number | null }>(database, 'SELECT refunded_at AS refundedAt FROM tickets WHERE id = ?', 't-1')[0]
      expect(ticket?.refundedAt).toBe(now)

      const lines = rows<{ total: number }>(database, "SELECT count(*) AS total FROM ledger_lines WHERE ticket_id = ? AND kind = 'REFUND'", 't-1')
      expect(lines[0]?.total).toBe(1)

      const entries = rows<{ total: number }>(database, 'SELECT count(*) AS total FROM ledger_entries')
      expect(entries[0]?.total).toBe(1)
    }
    finally {
      database.close()
    }
  })
})
