import { describe, expect, test } from 'bun:test'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { compsQuery, gpDepletionQuery, gpRevenueQuery } from '#server/utils/bar-reports'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// F-119 against the real migrations: what gross profit counts on the cost side, which clock the
// period runs on, and whose comps the bar manager's section carries (F-110 criterion 4).

// A bottle delivered at a penny the millilitre, so every cost below is the quantity itself.
const PENCE_PER_ML = 1
const FROM_AT = 1_000_000
const TO_AT = 2_000_000
const INSIDE = 1_500_000
const BEFORE = 900_000

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

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function bottle(database: TestDatabase, suffix = '1'): string {
  const id = `item-${suffix}`
  insert(database, 'bar_items', { id, name: `Gin ${suffix}`, unit: 'ML', container_ml: 700 })
  return id
}

function delivery(database: TestDatabase, id: string, itemId: string, qty: number, unitCostPence: number): string {
  insert(database, 'stock_movements', { id, item_id: itemId, qty, kind: 'DELIVERY', unit_cost_pence: unitCostPence, created_at: BEFORE })
  return id
}

// A REVERSAL cancels the movement it names, same item and opposite quantity (0053's trigger).
function reverse(database: TestDatabase, id: string, itemId: string, qty: number, reversesId: string): void {
  insert(database, 'stock_movements', { id, item_id: itemId, qty: -qty, kind: 'REVERSAL', reverses_id: reversesId, created_at: BEFORE })
}

interface EntryOptions { source?: string, tender?: string, compReason?: string }

function entry(database: TestDatabase, id: string, happenedAt: number, options: EntryOptions = {}): string {
  insert(database, 'ledger_entries', {
    id,
    happened_at: happenedAt,
    london_day: '2026-09-15',
    source: options.source ?? 'TILL',
    tender: options.tender ?? 'CARD',
    total_pence: 0,
    comp_reason: options.compReason ?? null,
  })
  return id
}

function line(database: TestDatabase, id: string, entryId: string, amountPence: number, unitPricePence = amountPence): string {
  insert(database, 'ledger_lines', { id, entry_id: entryId, kind: 'BAR_ITEM', amount_pence: amountPence, qty: 1, unit_price_pence: unitPricePence })
  return id
}

// The credit a void or a hand-entered correction posts: no ledger line of its own, so it nets in
// on its own clock (0053's trigger wants the same item and the opposite quantity).
function reversePour(database: TestDatabase, id: string, itemId: string, qty: number, reversesId: string, createdAt: number): void {
  insert(database, 'stock_movements', { id, item_id: itemId, qty, kind: 'REVERSAL', reverses_id: reversesId, created_at: createdAt })
}

// Depletion cites the sale line that caused it, which is the only route back to the entry's own
// clock; `created_at` is the moment the row was written, which is a different question.
function depletion(database: TestDatabase, id: string, itemId: string, qty: number, kind: string, lineId: string, createdAt: number): void {
  insert(database, 'stock_movements', { id, item_id: itemId, qty: -qty, kind, ref_table: 'ledger_lines', ref_id: lineId, created_at: createdAt })
}

interface GpRow { itemName: string, qtyDepleted: number, costPence: number }

const depleted = (database: TestDatabase): GpRow[] => read<GpRow>(database, gpDepletionQuery(FROM_AT, TO_AT))

describe('gross profit counts what a comp poured (F-110 criterion 4, F-119 criterion 1)', () => {
  test('a comp depletes the cost side exactly as a paid sale does', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      const comp = line(database, 'l-2', entry(database, 'e-2', INSIDE, { tender: 'COMP', compReason: 'On the house' }), 0, 500)
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, INSIDE)
      depletion(database, 'm-2', itemId, 50, 'COMP', comp, INSIDE)

      // Half of it given away and counted all the same.
      expect(depleted(database)).toEqual([{ itemName: 'Gin 1', qtyDepleted: 100, costPence: 100 }])
    })
  })

  test('a pour reversed in the same period nets to nothing, and leaves no empty row behind', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, INSIDE)
      reversePour(database, 'r-1', itemId, 50, 'm-1', INSIDE)

      expect(depleted(database)).toEqual([])
    })
  })

  test('a pour reversed later credits the period it was reversed in, not the one it was poured in', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, INSIDE)
      // Voided a week later: the credit is its own entry, in its own period.
      reversePour(database, 'r-1', itemId, 50, 'm-1', TO_AT + 86_400)

      expect(depleted(database)).toEqual([{ itemName: 'Gin 1', qtyDepleted: 50, costPence: 50 }])
      const [later] = read<GpRow>(database, gpDepletionQuery(TO_AT, TO_AT + 604_800))
      expect(later).toEqual({ itemName: 'Gin 1', qtyDepleted: -50, costPence: -50 })
    })
  })

  test('a stocktake adjustment is not a depletion and stays out of the cost side', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      insert(database, 'stock_movements', { id: 'm-1', item_id: itemId, qty: -20, kind: 'WASTAGE', reason: 'BREAKAGE', created_at: INSIDE })

      expect(depleted(database)).toEqual([])
    })
  })
})

describe('the cost basis is the weighted average of the deliveries that stand (F-119 criterion 1)', () => {
  test('two deliveries at different costs average by quantity, not by row', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 100, 100)
      delivery(database, 'd-2', itemId, 300, 200)
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      depletion(database, 'm-1', itemId, 40, 'SALE', sale, INSIDE)

      // (100*100 + 300*200) / 400 = 175p per ml, not the 150p a mean of the two rows would give.
      expect(depleted(database)[0]?.costPence).toBe(40 * 175)
    })
  })

  test('a delivery a reversal names leaves the average, so a mistyped cost can be undone', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 100, 100)
      delivery(database, 'd-2', itemId, 100, 9999)
      reverse(database, 'r-1', itemId, 100, 'd-2')
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      depletion(database, 'm-1', itemId, 10, 'SALE', sale, INSIDE)

      expect(depleted(database)[0]?.costPence).toBe(10 * 100)
    })
  })

  test('an item whose deliveries carry no cost contributes nothing to the cost side', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      insert(database, 'stock_movements', { id: 'd-1', item_id: itemId, qty: 700, kind: 'DELIVERY', created_at: BEFORE })
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, INSIDE)

      expect(depleted(database)[0]).toEqual({ itemName: 'Gin 1', qtyDepleted: 50, costPence: 0 })
    })
  })
})

describe('revenue and cost run on one clock (F-119 criterion 1, 0014)', () => {
  test('a sale recorded late keeps its revenue and its cost in the same period', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      const sale = line(database, 'l-1', entry(database, 'e-1', INSIDE), 500)
      // Posted a day after it happened: the movement's own clock is outside the period.
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, TO_AT + 86_400)

      const [revenue] = read<{ revenuePence: number }>(database, gpRevenueQuery(FROM_AT, TO_AT))
      expect(revenue?.revenuePence).toBe(500)
      expect(depleted(database)).toEqual([{ itemName: 'Gin 1', qtyDepleted: 50, costPence: 50 }])
    })
  })

  test('a sale that happened before the period is in neither half of it', async () => {
    await withDatabase((database) => {
      const itemId = bottle(database)
      delivery(database, 'd-1', itemId, 700, PENCE_PER_ML)
      const sale = line(database, 'l-1', entry(database, 'e-1', BEFORE), 500)
      depletion(database, 'm-1', itemId, 50, 'SALE', sale, INSIDE)

      const [revenue] = read<{ revenuePence: number }>(database, gpRevenueQuery(FROM_AT, TO_AT))
      expect(revenue?.revenuePence).toBe(0)
      expect(depleted(database)).toEqual([])
    })
  })
})

describe('the comps section belongs to the bar (F-119 criterion 1)', () => {
  test('a comp given at the box office stays out of the bar report', async () => {
    await withDatabase((database) => {
      const till = entry(database, 'e-1', INSIDE, { tender: 'COMP', compReason: 'A round on the house' })
      line(database, 'l-1', till, 0, 500)
      const desk = entry(database, 'e-2', INSIDE, { source: 'DESK', tender: 'COMP', compReason: 'A press ticket' })
      line(database, 'l-2', desk, 0, 2000)

      const comps = read<{ entryId: string, reason: string, foregonePence: number }>(database, compsQuery(FROM_AT, TO_AT))
      expect(comps.map(row => row.entryId)).toEqual(['e-1'])
      expect(comps[0]?.reason).toBe('A round on the house')
      expect(comps[0]?.foregonePence).toBe(500)
    })
  })
})
