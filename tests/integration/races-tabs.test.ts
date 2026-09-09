import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { expectOneWinner, race } from '#tests/helpers/race'

// F-109 criteria 2, 3. A `Promise.all` of HTTP requests does not reliably prove a SQL-level race
// in this harness, so this runs directly against the database (`tab-settlement.test.ts` is supplementary).
describe('a tab charge settles once, however many settlements race it (F-109)', () => {
  test('two settlements naming the same charge leave exactly one winner', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'Member'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-staff', 'staff@example.invalid', 'Staff'],
        [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
          VALUES (?, ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', 500, 'u-member')`, 'charge-1', 1_788_950_000],
        [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
          VALUES (?, 'charge-1', 'BAR_ITEM', 500, 1, 500)`, 'charge-1-line'],
      ])

      // Each attempt posts a whole settlement entry and its one line, the same shape
      // `settleTab` batches, so a loser's entry never survives without a line either.
      const answers = await race(2, async (index) => {
        try {
          database.batch([
            [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
              VALUES (?, ?, '2026-09-09', 'TILL', 'CARD', 'u-staff', 500)`, `settlement-${index}`, 1_788_950_100 + index],
            [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, settles_entry_id)
              VALUES (?, ?, 'TAB_SETTLEMENT', 500, 1, 500, 'charge-1')`, `settlement-${index}-line`, `settlement-${index}`],
          ])
          return { status: 200 }
        }
        catch {
          // The unique index's own refusal: `ledger_lines_settles_once` never lets a second
          // line name a charge already settled, whichever attempt's transaction lands first.
          return { status: 409 }
        }
      })

      expectOneWinner(answers)

      const settlementLines = rows<{ id: string }>(database, `SELECT id FROM ledger_lines WHERE settles_entry_id = 'charge-1'`)
      expect(settlementLines).toHaveLength(1)

      // Never read and compared: summed fresh, which is the only way the answer can be trusted
      // under a race, the same reasoning on-hand stock and a tab's own balance read fresh under.
      const outstanding = rows<{ total: number }>(database, `
        SELECT coalesce(sum(e.total_pence), 0) AS total FROM ledger_entries e
        WHERE e.tab_debtor_id = 'u-member' AND e.reverses_entry_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM ledger_lines l WHERE l.settles_entry_id = e.id)
      `)[0]?.total
      expect(outstanding).toBe(0)
    }
    finally {
      database.close()
    }
  })

  // Bounded at initiation (criterion 3): a charge that lands after a settlement has already
  // claimed its own charges is untouched, whatever else raced it.
  test('a charge posted while a settlement is in flight is not swept into it', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'Member'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-staff', 'staff@example.invalid', 'Staff'],
        [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
          VALUES ('charge-1', ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', 500, 'u-member')`, 1_788_950_000],
      ])

      const [settled, newCharge] = await Promise.all([
        (async () => {
          database.batch([
            [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
              VALUES ('settlement-1', ?, '2026-09-09', 'TILL', 'CARD', 'u-staff', 500)`, 1_788_950_100],
            [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, settles_entry_id)
              VALUES ('settlement-1-line', 'settlement-1', 'TAB_SETTLEMENT', 500, 1, 500, 'charge-1')`],
          ])
        })(),
        (async () => {
          database.batch([
            [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
              VALUES ('charge-2', ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', 500, 'u-member')`, 1_788_950_050],
            [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
              VALUES ('charge-2-line', 'charge-2', 'BAR_ITEM', 500, 1, 500)`],
          ])
        })(),
      ].map(promise => promise.then(() => ({ status: 200 })).catch(() => ({ status: 409 }))))

      expect(settled.status).toBe(200)
      expect(newCharge.status).toBe(200)

      const outstanding = rows<{ total: number }>(database, `
        SELECT coalesce(sum(e.total_pence), 0) AS total FROM ledger_entries e
        WHERE e.tab_debtor_id = 'u-member' AND e.reverses_entry_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM ledger_lines l WHERE l.settles_entry_id = e.id)
      `)[0]?.total
      expect(outstanding).toBe(500)
    }
    finally {
      database.close()
    }
  })
})
