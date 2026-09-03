import { describe, expect, test } from 'bun:test'
import { onHandColumn, onHandOf } from '#server/utils/bar'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-114 on the real migrations. On-hand is the sum of movements and nothing else, so the guards
// that keep the sum honest are the database's rather than a handler's (0010).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function bottle(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'item-1', name: 'House red', unit: 'ML', container_ml: 750, ...over }
  insert(database, 'bar_items', values)
  return String(values.id)
}

function move(database: TestDatabase, values: Record<string, unknown>): string {
  const row = { id: `mv-${Math.random().toString(36).slice(2, 10)}`, item_id: 'item-1', ...values }
  insert(database, 'stock_movements', row)
  return String(row.id)
}

function onHand(database: TestDatabase, itemId: string): number {
  const [statement, ...parameters] = boundStatement(database, onHandOf(itemId))
  return Number(rows<{ onHand: number }>(database, statement, ...parameters)[0]?.onHand ?? 0)
}

describe('a stocked item carries a name and a real counting unit (criterion 1)', () => {
  test('the unit is one of the two the bar counts in', async () => {
    await withDatabase((database) => {
      expect(() => bottle(database, { unit: 'PINTS' })).toThrow()
    })
  })

  test('a container size belongs to something measured, never to a whole item', async () => {
    await withDatabase((database) => {
      expect(() => bottle(database, { unit: 'ITEM', container_ml: 330 })).toThrow()
    })
  })

  test('the name is held once whatever the capitals', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => bottle(database, { id: 'item-2', name: 'HOUSE RED' })).toThrow()
    })
  })

  test('an item with movements cannot be deleted, only retired', async () => {
    await withDatabase((database) => {
      const id = bottle(database)
      move(database, { qty: 750, kind: 'DELIVERY', unit_cost_pence: 480 })

      expect(() => database.batch([['DELETE FROM bar_items WHERE id = ?', id]])).toThrow()
      database.batch([['UPDATE bar_items SET status = \'RETIRED\' WHERE id = ?', id]])
      expect(rows<{ status: string }>(database, 'SELECT status FROM bar_items')[0]?.status).toBe('RETIRED')
    })
  })

  // The damage the old estate recorded: a container size rewritten under live stock restates
  // every figure taken from the movements before it (audit PR-12, 0017).
  test('the unit and container size are fixed once stock has moved', async () => {
    await withDatabase((database) => {
      const id = bottle(database)
      database.batch([['UPDATE bar_items SET container_ml = 700 WHERE id = ?', id]])

      move(database, { qty: 700, kind: 'DELIVERY' })
      expect(() => database.batch([['UPDATE bar_items SET container_ml = 750 WHERE id = ?', id]])).toThrow()
      expect(() => database.batch([['UPDATE bar_items SET unit = \'ITEM\' WHERE id = ?', id]])).toThrow()
      // Everything else about it is still editable.
      database.batch([['UPDATE bar_items SET par_qty = 12 WHERE id = ?', id]])
    })
  })
})

describe('on-hand is the sum of movements and nothing stores it (criterion 2)', () => {
  test('no column anywhere holds a balance', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string, table: string }>(database, `
        SELECT m.name AS "table", i.name AS name
        FROM sqlite_master m, pragma_table_info(m.name) i
        WHERE m.type = 'table'
      `)
      const stored = columns
        .filter(column => /on_hand|stock_level|balance|qty_held|current_qty/.test(column.name))
        .map(column => `${column.table}.${column.name}`)
      expect(stored).toEqual([])
    })
  })

  test('the sum is what a delivery, a sale and a wastage leave behind', async () => {
    await withDatabase((database) => {
      const id = bottle(database)
      expect(onHand(database, id)).toBe(0)

      move(database, { qty: 6000, kind: 'DELIVERY', unit_cost_pence: 480 })
      move(database, { qty: -175, kind: 'SALE', ref_table: 'bar_sale_lines', ref_id: 'line-1' })
      move(database, { qty: -750, kind: 'WASTAGE', reason: 'BREAKAGE' })

      expect(onHand(database, id)).toBe(5075)
    })
  })

  test('an item nobody has moved reads as nought rather than as nothing', async () => {
    await withDatabase((database) => {
      const id = bottle(database)
      const [statement, ...parameters] = boundStatement(database, onHandColumn('i'))
      const value = rows<{ onHand: number }>(database,
        `SELECT ${statement} AS onHand FROM bar_items i WHERE i.id = ?`, ...parameters, id)
      expect(Number(value[0]?.onHand)).toBe(0)
    })
  })
})

describe('the movement kinds cover what the bar does (criterion 3)', () => {
  test('a kind outside the vocabulary is refused', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: 10, kind: 'SHRINKAGE' })).toThrow()
    })
  })

  test('a delivery adds and carries its cost', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: -750, kind: 'DELIVERY' })).toThrow()
      move(database, { qty: 750, kind: 'DELIVERY', unit_cost_pence: 480 })
    })
  })

  test('a cost belongs to a delivery and to nothing else', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: -750, kind: 'WASTAGE', reason: 'BREAKAGE', unit_cost_pence: 480 })).toThrow()
    })
  })

  test('wastage takes away and names a reason', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: -750, kind: 'WASTAGE' })).toThrow()
      expect(() => move(database, { qty: 750, kind: 'WASTAGE', reason: 'BREAKAGE' })).toThrow()
      move(database, { qty: -750, kind: 'WASTAGE', reason: 'BREAKAGE' })
    })
  })

  test('a movement of nothing is not a movement', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: 0, kind: 'ADJUST', reason: 'COUNT_CORRECTION' })).toThrow()
    })
  })

  // A stocktake that finishes twice would otherwise post its adjustments twice (F-115).
  test('one stocktake line posts one movement', async () => {
    await withDatabase((database) => {
      bottle(database)
      move(database, { qty: -25, kind: 'STOCKTAKE', ref_table: 'stocktake_lines', ref_id: 'stl-1' })
      expect(() => move(database, { qty: -25, kind: 'STOCKTAKE', ref_table: 'stocktake_lines', ref_id: 'stl-1' })).toThrow()
      // The same id under a different document is a different thing entirely.
      move(database, { qty: -25, kind: 'SALE', ref_table: 'bar_sale_lines', ref_id: 'stl-1' })
    })
  })
})

describe('movements are append-only and corrections supersede (criterion 4)', () => {
  test('a movement cannot be edited', async () => {
    await withDatabase((database) => {
      bottle(database)
      const id = move(database, { qty: 750, kind: 'DELIVERY' })
      expect(() => database.batch([['UPDATE stock_movements SET qty = 700 WHERE id = ?', id]])).toThrow()
      expect(rows<{ qty: number }>(database, 'SELECT qty FROM stock_movements')[0]?.qty).toBe(750)
    })
  })

  test('a movement cannot be deleted', async () => {
    await withDatabase((database) => {
      bottle(database)
      move(database, { qty: 750, kind: 'DELIVERY' })
      expect(() => database.batch([['DELETE FROM stock_movements']])).toThrow()
      expect(rows(database, 'SELECT id FROM stock_movements')).toHaveLength(1)
    })
  })

  test('a correction is a reversing movement naming the original, and the sum reflects both', async () => {
    await withDatabase((database) => {
      const item = bottle(database)
      const wrong = move(database, { qty: 7500, kind: 'DELIVERY', unit_cost_pence: 480 })
      expect(onHand(database, item)).toBe(7500)

      move(database, { qty: -7500, kind: 'REVERSAL', reason: 'COUNT_CORRECTION', reverses_id: wrong })
      move(database, { qty: 750, kind: 'DELIVERY', unit_cost_pence: 480 })

      expect(onHand(database, item)).toBe(750)
      expect(rows(database, 'SELECT id FROM stock_movements')).toHaveLength(3)
    })
  })

  test('a reversal cancels exactly what it names', async () => {
    await withDatabase((database) => {
      bottle(database, { id: 'item-2', name: 'Lager keg', unit: 'ML', container_ml: 50_000 })
      bottle(database)
      const original = move(database, { qty: 7500, kind: 'DELIVERY' })

      expect(() => move(database, { qty: -7000, kind: 'REVERSAL', reverses_id: original })).toThrow()
      expect(() => move(database, { item_id: 'item-2', qty: -7500, kind: 'REVERSAL', reverses_id: original })).toThrow()
      move(database, { qty: -7500, kind: 'REVERSAL', reverses_id: original })
    })
  })

  test('a movement is reversed once, so a correction cannot hide behind a correction', async () => {
    await withDatabase((database) => {
      bottle(database)
      const original = move(database, { qty: 7500, kind: 'DELIVERY' })
      move(database, { qty: -7500, kind: 'REVERSAL', reverses_id: original })
      expect(() => move(database, { qty: -7500, kind: 'REVERSAL', reverses_id: original })).toThrow()
    })
  })

  test('naming what is reversed and being a reversal are the same statement', async () => {
    await withDatabase((database) => {
      bottle(database)
      const original = move(database, { qty: 7500, kind: 'DELIVERY' })
      expect(() => move(database, { qty: -7500, kind: 'ADJUST', reason: 'OTHER', reverses_id: original })).toThrow()
      expect(() => move(database, { qty: -7500, kind: 'REVERSAL' })).toThrow()
    })
  })
})

describe('a movement stamps who, when and what document (criterion 5)', () => {
  test('the actor is a real account, and null is the system acting', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: 750, kind: 'DELIVERY', actor_id: 'nobody' })).toThrow()

      insert(database, 'users', { id: 'u1', email: 'bar@example.invalid', name: 'A Manager', verified: 1 })
      move(database, { qty: 750, kind: 'DELIVERY', actor_id: 'u1' })
      move(database, { qty: 25, kind: 'DELIVERY' })
    })
  })

  test('an actor cannot be deleted out from under the history they wrote', async () => {
    await withDatabase((database) => {
      bottle(database)
      insert(database, 'users', { id: 'u1', email: 'bar@example.invalid', name: 'A Manager', verified: 1 })
      move(database, { qty: 750, kind: 'DELIVERY', actor_id: 'u1' })
      expect(() => database.batch([['DELETE FROM users WHERE id = \'u1\'']])).toThrow()
    })
  })

  test('a source document is a table and an id, or neither', async () => {
    await withDatabase((database) => {
      bottle(database)
      expect(() => move(database, { qty: -175, kind: 'SALE', ref_table: 'bar_sale_lines' })).toThrow()
      expect(() => move(database, { qty: -175, kind: 'SALE', ref_id: 'line-1' })).toThrow()
      move(database, { qty: -175, kind: 'SALE', ref_table: 'bar_sale_lines', ref_id: 'line-1' })
    })
  })

  test('every movement is stamped with a time without anybody supplying one', async () => {
    await withDatabase((database) => {
      bottle(database)
      move(database, { qty: 750, kind: 'DELIVERY' })
      const [row] = rows<{ createdAt: number }>(database, 'SELECT created_at AS createdAt FROM stock_movements')
      expect(row!.createdAt).toBeGreaterThan(1_700_000_000)
    })
  })
})
