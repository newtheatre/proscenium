import { describe, expect, test } from 'bun:test'
import { expectOneWinner, race } from '#tests/helpers/race'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// D-124 criterion 4: the cap is asked atomically at issue, not at request. Split from
// races-refund.test.ts, a separate invariant on a separate table (K-105's own convention).

// Mirrors server/utils/pass-issue.ts's exact shape (claim, then `changes()`, then EXISTS).
function attemptIssue(database: TestDatabase, passId: string, entryId: string, lineId: string): { status: number } {
  database.batch([
    [`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
      SELECT ?, ?, 'pt-1', 'price-1', 'u-buyer', 4500, 'ACTIVE', 'u-officer'
      WHERE (SELECT count(*) FROM passes WHERE pass_type_id = 'pt-1' AND status != 'CANCELLED') < 1`,
    passId, passId.toUpperCase().slice(0, 6)],
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
      SELECT ?, ?, '2026-09-09', 'DESK', 'CARD', 'u-officer', 4500
      WHERE changes() = 1`, entryId, 1_780_000_000],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, price_ref)
      SELECT ?, ?, 'PASS_SALE', 4500, 1, 4500, ?
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ?)`, lineId, entryId, passId, entryId],
  ])

  const entry = rows<{ id: string }>(database, 'SELECT id FROM ledger_entries WHERE id = ?', entryId)
  return { status: entry.length > 0 ? 200 : 409 }
}

describe('issuing a pass past its cap: concurrent issues leave exactly one (I-102, D-124 criterion 4)', () => {
  test('two racing issues against a cap of one leave exactly one pass and one ledger entry', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'Officer'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-buyer', 'buyer@example.invalid', 'Buyer'],
        ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, max_issued, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'pt-1', 'season-pass', 'Season pass', 1_000, 2_000, 1, 'ON_SALE'],
        ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
      ])

      const answers = await race(2, async index => attemptIssue(database, `pass-${index}`, `entry-${index}`, `line-${index}`))

      expectOneWinner(answers)

      const passes = rows<{ total: number }>(database, 'SELECT count(*) AS total FROM passes WHERE pass_type_id = \'pt-1\'')
      expect(passes[0]?.total).toBe(1)

      const lines = rows<{ total: number }>(database, 'SELECT count(*) AS total FROM ledger_lines WHERE kind = \'PASS_SALE\'')
      expect(lines[0]?.total).toBe(1)
    }
    finally {
      database.close()
    }
  })
})
