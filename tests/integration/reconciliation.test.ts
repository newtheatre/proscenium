import { describe, expect, test } from 'bun:test'
import {
  cardSalesQuery,
  compsQuery,
  discountsQuery,
  deskTakingsQuery,
  refundsQuery,
  tabChargesQuery,
  tabSettlementsQuery,
} from '#server/utils/reconciliation'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Reconciliation to the expected SumUp Z figure (F-118), against the real migrations: proved
// here against the schema rather than assumed from the shape of the SQL.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

let entrySeq = 0
let lineSeq = 0

// happenedAt defaults to the schema's own now(), which is why every case below stamps one
// explicitly: a night's window is a fact about the row, never about when the test happened to run.
function entry(database: TestDatabase, over: {
  source: string
  tender: string
  happenedAt: number
  reversesEntryId?: string | null
  totalPence?: number
}): string {
  const id = `e-${++entrySeq}`
  database.batch([[
    `INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, reverses_entry_id, total_pence)
     VALUES (?, '2026-01-01', ?, ?, ?, ?, ?)`,
    id, over.source, over.tender, over.happenedAt, over.reversesEntryId ?? null, over.totalPence ?? 0,
  ]])
  return id
}

function line(database: TestDatabase, entryId: string, over: {
  kind: string
  amountPence: number
  qty?: number
  unitPricePence?: number
  discountId?: string | null
  discountPence?: number | null
}): void {
  database.batch([[
    `INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, discount_id, discount_pence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    `l-${++lineSeq}`, entryId, over.kind, over.amountPence, over.qty ?? 1, over.unitPricePence ?? null,
    over.discountId ?? null, over.discountPence ?? null,
  ]])
}

// A plain night, safely clear of any DST transition, for the cases that are not themselves about one.
const NIGHT = '2026-01-05'
const FROM_AT = Math.floor(Date.UTC(2026, 0, 5, 4, 0, 0) / 1000)
const TO_AT = Math.floor(Date.UTC(2026, 0, 6, 4, 0, 0) / 1000)

describe('card sales, the first half of the expected figure (criterion 1)', () => {
  test('sums BAR_ITEM lines on CARD-tendered till entries in the window', async () => {
    await withDatabase((database) => {
      const id = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, id, { kind: 'BAR_ITEM', amountPence: 500 })
      line(database, id, { kind: 'BAR_ITEM', amountPence: 300 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))
      expect(row).toMatchObject({ cardSalesPence: 800 })
    })
  })

  test('never a tab settlement: the same tender, a different kind, the other half of criterion 1', async () => {
    await withDatabase((database) => {
      const id = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, id, { kind: 'TAB_SETTLEMENT', amountPence: 1200 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))
      expect(row).toMatchObject({ cardSalesPence: 0 })
    })
  })

  test('never a comp or a tab charge: only CARD tender counts as a sale', async () => {
    await withDatabase((database) => {
      const compEntry = entry(database, { source: 'TILL', tender: 'COMP', happenedAt: FROM_AT + 60 })
      line(database, compEntry, { kind: 'BAR_ITEM', amountPence: 0, unitPricePence: 500 })
      const tabEntry = entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 60 })
      line(database, tabEntry, { kind: 'BAR_ITEM', amountPence: 700 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))
      expect(row).toMatchObject({ cardSalesPence: 0 })
    })
  })

  test('outside the night\'s window, on either side, is not this night\'s money', async () => {
    await withDatabase((database) => {
      const before = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT - 1 })
      line(database, before, { kind: 'BAR_ITEM', amountPence: 400 })
      const after = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: TO_AT })
      line(database, after, { kind: 'BAR_ITEM', amountPence: 400 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))
      expect(row).toMatchObject({ cardSalesPence: 0 })
    })
  })

  // A reversal is summed with what it reverses rather than excluded (0031): a future bar-sale
  // correction lands as a negative BAR_ITEM line and nets in here, the house convention throughout.
  test('a reversal nets against what it reverses, since both are summed rather than one excluded', async () => {
    await withDatabase((database) => {
      const original = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, original, { kind: 'BAR_ITEM', amountPence: 1000 })
      const reversal = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, reversesEntryId: original })
      line(database, reversal, { kind: 'BAR_ITEM', amountPence: -1000 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery(NIGHT))
      expect(row).toMatchObject({ cardSalesPence: 0 })
    })
  })
})

describe('tab settlements, the second half of the expected figure (criterion 1)', () => {
  test('sums TAB_SETTLEMENT lines, never a plain sale', async () => {
    await withDatabase((database) => {
      const settlement = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, settlement, { kind: 'TAB_SETTLEMENT', amountPence: 1500 })
      const sale = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, sale, { kind: 'BAR_ITEM', amountPence: 500 })

      const [row] = read<{ tabSettlementsPence: number }>(database, tabSettlementsQuery(NIGHT))
      expect(row).toMatchObject({ tabSettlementsPence: 1500 })
    })
  })
})

describe('comps: count and foregone value at full price (criterion 2)', () => {
  test('one comp entry with two lines is one comp, foregone at unit price', async () => {
    await withDatabase((database) => {
      const id = entry(database, { source: 'TILL', tender: 'COMP', happenedAt: FROM_AT + 60 })
      line(database, id, { kind: 'BAR_ITEM', amountPence: 0, qty: 2, unitPricePence: 350 })

      const [row] = read<{ compsCount: number, compsForegonePence: number }>(database, compsQuery(NIGHT))
      expect(row).toMatchObject({ compsCount: 1, compsForegonePence: 700 })
    })
  })

  test('a desk comp never counts towards the bar\'s own figure', async () => {
    await withDatabase((database) => {
      const id = entry(database, { source: 'DESK', tender: 'COMP', happenedAt: FROM_AT + 60 })
      line(database, id, { kind: 'WALK_UP', amountPence: 0, unitPricePence: 1200 })

      const [row] = read<{ compsCount: number, compsForegonePence: number }>(database, compsQuery(NIGHT))
      expect(row).toMatchObject({ compsCount: 0, compsForegonePence: 0 })
    })
  })
})

describe('discounts given (criterion 2)', () => {
  test('sums the pence actually discounted, not the percentage', async () => {
    await withDatabase((database) => {
      const id = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60 })
      line(database, id, { kind: 'BAR_ITEM', amountPence: 900, discountId: 'd-1', discountPence: 100 })
      line(database, id, { kind: 'BAR_ITEM', amountPence: 500 })

      const [row] = read<{ discountsPence: number }>(database, discountsQuery(NIGHT))
      expect(row).toMatchObject({ discountsPence: 100 })
    })
  })
})

describe('refunds, itemised though already netted into card sales (criterion 2)', () => {
  test('a CARD reversal reads as a positive magnitude', async () => {
    await withDatabase((database) => {
      const original = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, totalPence: 1000 })
      entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 120, reversesEntryId: original, totalPence: -1000 })

      const [row] = read<{ refundsPence: number }>(database, refundsQuery(NIGHT))
      expect(row).toMatchObject({ refundsPence: 1000 })
    })
  })

  test('no reversal route exists yet, so a plain sale never counts as one', async () => {
    await withDatabase((database) => {
      entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, totalPence: 500 })

      const [row] = read<{ refundsPence: number }>(database, refundsQuery(NIGHT))
      expect(row).toMatchObject({ refundsPence: 0 })
    })
  })
})

describe('tab charges: credit extended, net of any void (criterion 2)', () => {
  test('a charge and its void net to zero, both summed rather than the charge excluded (0031)', async () => {
    await withDatabase((database) => {
      const charge = entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 60, totalPence: 600 })
      entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 120, reversesEntryId: charge, totalPence: -600 })

      const [row] = read<{ tabChargesPence: number }>(database, tabChargesQuery(NIGHT))
      expect(row).toMatchObject({ tabChargesPence: 0 })
    })
  })

  test('an outstanding charge with no void is the full credit extended', async () => {
    await withDatabase((database) => {
      entry(database, { source: 'TILL', tender: 'TAB', happenedAt: FROM_AT + 60, totalPence: 600 })

      const [row] = read<{ tabChargesPence: number }>(database, tabChargesQuery(NIGHT))
      expect(row).toMatchObject({ tabChargesPence: 600 })
    })
  })
})

describe('the desk\'s takings, presented alongside the bar\'s own figure (criterion 1)', () => {
  test('sums CARD-tendered desk entries the same night', async () => {
    await withDatabase((database) => {
      entry(database, { source: 'DESK', tender: 'CARD', happenedAt: FROM_AT + 60, totalPence: 2000 })
      entry(database, { source: 'DESK', tender: 'COMP', happenedAt: FROM_AT + 60, totalPence: 0 })
      entry(database, { source: 'TILL', tender: 'CARD', happenedAt: FROM_AT + 60, totalPence: 500 })

      const [row] = read<{ deskTakingsPence: number }>(database, deskTakingsQuery(NIGHT))
      expect(row).toMatchObject({ deskTakingsPence: 2000 })
    })
  })
})

// 2026: clocks go forward at 01:00 GMT on 29 March, back at 02:00 BST on 25 October, the same
// two nights show-night.test.ts names (criterion 5).
describe('a show night spanning a DST transition still bounds correctly (criterion 5)', () => {
  test('the 23-hour night the clocks go forward: a sale one minute before 04:00 the next day counts', async () => {
    await withDatabase((database) => {
      // 2026-03-29T03:00:00Z is 04:00 BST, the night's own close.
      const justInside = Math.floor(Date.UTC(2026, 2, 29, 2, 59, 0) / 1000)
      const justOutside = Math.floor(Date.UTC(2026, 2, 29, 3, 0, 0) / 1000)
      const inside = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: justInside })
      line(database, inside, { kind: 'BAR_ITEM', amountPence: 100 })
      const outside = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: justOutside })
      line(database, outside, { kind: 'BAR_ITEM', amountPence: 900 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery('2026-03-28'))
      expect(row).toMatchObject({ cardSalesPence: 100 })
    })
  })

  test('the 25-hour night the clocks go back: a sale at 03:59 GMT the next day still counts', async () => {
    await withDatabase((database) => {
      // 2026-10-25T03:59:59Z is 03:59 GMT, one second before the night's own close at 04:00.
      const justInside = Math.floor(Date.UTC(2026, 9, 25, 3, 59, 59) / 1000)
      const justOutside = Math.floor(Date.UTC(2026, 9, 25, 4, 0, 0) / 1000)
      const inside = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: justInside })
      line(database, inside, { kind: 'BAR_ITEM', amountPence: 250 })
      const outside = entry(database, { source: 'TILL', tender: 'CARD', happenedAt: justOutside })
      line(database, outside, { kind: 'BAR_ITEM', amountPence: 750 })

      const [row] = read<{ cardSalesPence: number }>(database, cardSalesQuery('2026-10-24'))
      expect(row).toMatchObject({ cardSalesPence: 250 })
    })
  })
})
