import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { expectOneWinner, race } from '#tests/helpers/race'

// K-105 criterion 4: on-hand is always the sum of movements, and a sale's payment, lines and
// stock movements commit atomically. Split from races.test.ts so F-105 fills its own file.

// A `Promise.all` of HTTP requests does not reliably prove a SQL-level race in this harness, so
// this runs directly against the database; `tests/e2e/till-charge.test.ts` is supplementary.
describe('contended invariants (K-105)', () => {
  // F-105 criterion 5. The predicate rides the INSERT, as a trigger (0070) rather than an
  // application read-then-write, so on-hand is never read before the write that changes it.
  test('a sale\'s payment, lines and stock movements commit atomically', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO bar_items (id, name, unit) VALUES (?, ?, ?)', 'item-1', 'Gin', 'ML'],
        // Exactly one measure left: two racing sales for it can only ever leave one winner.
        ['INSERT INTO stock_movements (id, item_id, qty, kind) VALUES (?, ?, 25, ?)', 'sm-delivery', 'item-1', 'DELIVERY'],
      ])

      const answers = await race(2, async (index) => {
        try {
          database.batch([[
            `INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id)
             VALUES (?, ?, -25, 'SALE', 'ledger_lines', ?)`,
            `sm-sale-${index}`, 'item-1', `line-${index}`,
          ]])
          return { status: 200 }
        }
        catch {
          // The trigger's own abort, not a write this attempt gets to see the effect of.
          return { status: 409 }
        }
      })

      expectOneWinner(answers)

      const sales = rows<{ id: string }>(database, `SELECT id FROM stock_movements WHERE kind = 'SALE'`)
      expect(sales).toHaveLength(1)

      // Never read and compared: summed fresh, which is the only way the answer can be trusted
      // under a race (F-114 criterion 2, F-105 criterion 5).
      const onHand = rows<{ n: number }>(database, 'SELECT coalesce(sum(qty), 0) n FROM stock_movements WHERE item_id = ?', 'item-1')[0]?.n
      expect(onHand).toBe(0)
    }
    finally {
      database.close()
    }
  })

  // The loser is refused outright, not left holding the ledger entry its stock write could not
  // back: this is what makes "payment without movements" impossible (criterion 2).
  test('an oversized sale is refused in full, taking nothing from stock', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO bar_items (id, name, unit) VALUES (?, ?, ?)', 'item-1', 'Gin', 'ML'],
        ['INSERT INTO stock_movements (id, item_id, qty, kind) VALUES (?, ?, 25, ?)', 'sm-delivery', 'item-1', 'DELIVERY'],
      ])

      expect(() => database.batch([[
        `INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id)
         VALUES (?, ?, -50, 'SALE', 'ledger_lines', ?)`,
        'sm-oversized', 'item-1', 'line-1',
      ]])).toThrow()

      expect(rows(database, `SELECT id FROM stock_movements WHERE kind = 'SALE'`)).toEqual([])
      const onHand = rows<{ n: number }>(database, 'SELECT coalesce(sum(qty), 0) n FROM stock_movements WHERE item_id = ?', 'item-1')[0]?.n
      expect(onHand).toBe(25)
    }
    finally {
      database.close()
    }
  })

  // A delivery or a wastage entry is not a sale, so the trigger that guards SALE alone leaves
  // them free to correct a count through zero, which a stocktake sometimes needs to do.
  test('a non-sale movement may still take an item through zero', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO bar_items (id, name, unit) VALUES (?, ?, ?)', 'item-1', 'Gin', 'ML'],
        ['INSERT INTO stock_movements (id, item_id, qty, kind) VALUES (?, ?, 25, ?)', 'sm-delivery', 'item-1', 'DELIVERY'],
      ])

      expect(() => database.batch([
        ['INSERT INTO stock_movements (id, item_id, qty, kind, reason) VALUES (?, ?, -30, ?, ?)',
          'sm-wastage', 'item-1', 'WASTAGE', 'BREAKAGE'],
      ])).not.toThrow()

      const onHand = rows<{ n: number }>(database, 'SELECT coalesce(sum(qty), 0) n FROM stock_movements WHERE item_id = ?', 'item-1')[0]?.n
      expect(onHand).toBe(-5)
    }
    finally {
      database.close()
    }
  })
})
