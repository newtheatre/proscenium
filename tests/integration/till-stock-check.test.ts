import { describe, expect, test } from 'bun:test'
import { onHandOfItems } from '#server/utils/bar'
import { NOT_ENOUGH_STOCK, stockShortOf } from '#shared/utils/sale'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-124 criterion 8 on the real migrations: the read before the SumUp app opens refuses exactly
// what the sale's own trigger would, and never more (issue 1258).

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

function item(database: TestDatabase, id: string, delivered: number | null): void {
  insert(database, 'bar_items', { id, name: `Item ${id}`, unit: 'ITEM' })
  if (delivered !== null) insert(database, 'stock_movements', { id: `mv-${id}`, item_id: id, qty: delivered, kind: 'DELIVERY', unit_cost_pence: 1 })
}

function onHand(database: TestDatabase, itemIds: string[]): Map<string, number> {
  const [statement, ...parameters] = boundStatement(database, onHandOfItems(itemIds))
  return new Map(rows<{ itemId: string, onHand: number }>(database, statement, ...parameters).map(row => [row.itemId, Number(row.onHand)]))
}

// The sale's own write, one movement per ingredient per line, as `commitSale` batches it.
function sell(database: TestDatabase, lines: Array<{ depletion: Array<{ itemId: string, qty: number }>, qty: number }>): void {
  database.batch(lines.flatMap((line, index) => line.depletion.map((ingredient, at) => [
    'INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id) VALUES (?, ?, ?, ?, ?, ?)',
    `sale-${index}-${at}`, ingredient.itemId, -(ingredient.qty * line.qty), 'SALE', 'ledger_lines', `line-${index}`,
  ] as [string, ...unknown[]])))
}

// One can per serving: `qty` is how many the line sells, never how much one serving pours.
const can = (itemId: string, qty = 1) => ({ depletion: [{ itemId, qty: 1 }], qty })

describe('on-hand is read for the basket\'s own items only (F-124 criterion 8, 0003)', () => {
  test('each item reads the sum of its movements', async () => {
    await withDatabase((database) => {
      item(database, 'cider', 6)
      item(database, 'lager', 2)
      insert(database, 'stock_movements', { id: 'mv-sold', item_id: 'cider', qty: -4, kind: 'SALE', ref_table: 'ledger_lines', ref_id: 'l-1' })

      expect(onHand(database, ['cider', 'lager'])).toEqual(new Map([['cider', 2], ['lager', 2]]))
    })
  })

  test('an item that has never moved is absent, which reads as none left', async () => {
    await withDatabase((database) => {
      item(database, 'cider', null)
      expect(onHand(database, ['cider']).size).toBe(0)
      expect(stockShortOf([can('cider')], new Map())).toEqual(['cider'])
    })
  })

  test('the read binds one parameter per item asked for, never one per catalogue row', async () => {
    await withDatabase((database) => {
      for (const id of ['a', 'b', 'c', 'd']) item(database, id, 1)
      const [, ...parameters] = boundStatement(database, onHandOfItems(['a', 'b']))
      expect(parameters).toEqual(['a', 'b'])
    })
  })
})

describe('the check refuses what the trigger would refuse, and nothing else (F-124 criterion 8)', () => {
  test('a basket on-hand covers passes the check and the sale lands', async () => {
    await withDatabase((database) => {
      item(database, 'cider', 3)
      const basket = [can('cider', 3)]
      expect(stockShortOf(basket, onHand(database, ['cider']))).toEqual([])
      expect(() => sell(database, basket)).not.toThrow()
    })
  })

  test('two lines pouring the same item are summed, as the trigger sees them in one batch', async () => {
    await withDatabase((database) => {
      item(database, 'gin', 50)
      const basket = [
        { depletion: [{ itemId: 'gin', qty: 25 }], qty: 1 },
        { depletion: [{ itemId: 'gin', qty: 50 }], qty: 1 },
      ]
      expect(stockShortOf(basket, onHand(database, ['gin']))).toEqual(['gin'])
      expect(() => sell(database, basket)).toThrow(/stock_movements_sale_exceeds_on_hand/)
    })
  })

  test('only the short item is named when another in the same basket is covered', async () => {
    await withDatabase((database) => {
      item(database, 'cider', 5)
      item(database, 'lager', 1)
      expect(stockShortOf([can('cider', 2), can('lager', 2)], onHand(database, ['cider', 'lager']))).toEqual(['lager'])
    })
  })

  test('a basket depleting nothing has nothing to be short of', () => {
    expect(stockShortOf([{ depletion: [], qty: 3 }], new Map())).toEqual([])
  })
})

describe('the refusal reads as the sale\'s own does (F-124 criterion 8)', () => {
  test('the wording says nothing has been charged, because nothing has', () => {
    expect(NOT_ENOUGH_STOCK).toBe('Not enough left in stock for this sale: nothing has been charged.')
  })
})
