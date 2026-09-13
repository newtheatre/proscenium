import { describe, expect, test } from 'bun:test'
import {
  ledgerEntriesClause,
  ledgerEntriesQuery,
  openVarianceQuery,
  periodBounds,
  revenueBySourceQuery,
  seasonRefundsQuery,
} from '#server/utils/season-dashboard'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { ledgerEntriesList } from '#shared/utils/ledger-entries-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

const entriesSchema = filterQuerySchema(ledgerEntriesList)

// happenedAt is required for every real request (the page defaults to today), but a test that
// wants every entry regardless of when it posted asks for a range wide enough to hold them all.
function entriesQuery(raw: Record<string, string> = {}): ReturnType<typeof entriesSchema.parse> {
  return entriesSchema.parse({ happenedAt: 'between:2020-01-01,2030-01-01', ...raw })
}

// I-105 against the real migrations: every figure scoped by a predicate over a resolved range,
// never one parameter per row it covers (0001, 0003, 0006).

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

// BAR_ITEM and friends, not TICKET_COLLECTION: D-114's own trigger refuses a TICKET_COLLECTION
// line with no collected reservation behind it, and these tests exercise the figure generically.
function entry(database: TestDatabase, source: string, tender: string, happenedAt: number, day: string, reverses: string | null = null, totalPence = 0): string {
  const id = `e-${++entrySeq}`
  database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, reverses_entry_id, total_pence) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, day, source, tender, happenedAt, reverses, totalPence]])
  return id
}

function line(database: TestDatabase, entryId: string, kind: string, amountPence: number, options: { unitPricePence?: number, discountPence?: number } = {}): void {
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, unit_price_pence, discount_pence) VALUES (?, ?, ?, ?, ?, ?)',
    `l-${++lineSeq}`, entryId, kind, amountPence, options.unitPricePence ?? null, options.discountPence ?? 0]])
}

function person(database: TestDatabase, id: string): void {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
}

describe('period boundaries, Europe/London (criterion 1)', () => {
  test('the season is 1 August to 31 July, and an entry at 23:59 on 31 July is still inside it', () => {
    const bounds = periodBounds({ kind: 'SEASON', year: 2026 })
    expect(bounds.fromDay).toBe('2025-08-01')
    expect(bounds.toDay).toBe('2026-07-31')

    // 22:59 UTC on 31 July 2026 is 23:59 BST.
    const lastMinute = Math.floor(new Date('2026-07-31T22:59:00Z').getTime() / 1000)
    expect(lastMinute).toBeGreaterThanOrEqual(bounds.fromAt)
    expect(lastMinute).toBeLessThan(bounds.toAt)
  })

  test('the instant the season turns over belongs to the next one', () => {
    const bounds = periodBounds({ kind: 'SEASON', year: 2026 })
    // 23:00 UTC on 31 July 2026 is past midnight on 1 August BST.
    const firstMinuteOfNext = Math.floor(new Date('2026-07-31T23:00:00Z').getTime() / 1000)
    expect(firstMinuteOfNext).toBeGreaterThanOrEqual(bounds.toAt)
  })

  test('a month crosses the year boundary correctly', () => {
    const bounds = periodBounds({ kind: 'MONTH', year: 2025, month: 12 })
    expect(bounds.fromDay).toBe('2025-12-01')
    expect(bounds.toDay).toBe('2025-12-31')
  })

  test('a week is the seven days starting on the day named', () => {
    const bounds = periodBounds({ kind: 'WEEK', day: '2026-09-14' })
    expect(bounds.fromDay).toBe('2026-09-14')
    expect(bounds.toDay).toBe('2026-09-20')
  })

  // I-107's own defined term: the range travels with the request rather than being resolved a
  // second time here, so a term's own dates are exactly what the caller already looked up.
  test('a term is exactly the range named, inclusive at both ends', () => {
    const bounds = periodBounds({ kind: 'TERM', fromDay: '2026-09-21', toDay: '2026-12-11' })
    expect(bounds.fromDay).toBe('2026-09-21')
    expect(bounds.toDay).toBe('2026-12-11')
    // December is GMT, no DST offset to account for.
    const lastMinute = Math.floor(new Date('2026-12-11T23:59:00Z').getTime() / 1000)
    const firstMinuteAfter = Math.floor(new Date('2026-12-12T00:00:00Z').getTime() / 1000)
    expect(lastMinute).toBeGreaterThanOrEqual(bounds.fromAt)
    expect(lastMinute).toBeLessThan(bounds.toAt)
    expect(firstMinuteAfter).toBeGreaterThanOrEqual(bounds.toAt)
  })
})

describe('revenue by source (criterion 2)', () => {
  test('only CARD-tendered lines count, grouped by source', async () => {
    await withDatabase(async (database) => {
      const desk = entry(database, 'DESK', 'CARD', 1000, '2026-09-15')
      line(database, desk, 'WALK_UP', 900)
      const bar = entry(database, 'TILL', 'CARD', 1000, '2026-09-15')
      line(database, bar, 'BAR_ITEM', 400)
      const tab = entry(database, 'TILL', 'TAB', 1000, '2026-09-15')
      line(database, tab, 'BAR_ITEM', 350)

      const bySource = read<{ source: string, totalPence: number }>(database, revenueBySourceQuery(0, 2000))
      expect(bySource.sort((a, b) => a.source.localeCompare(b.source))).toEqual([
        { source: 'DESK', totalPence: 900 },
        { source: 'TILL', totalPence: 400 },
      ])
    })
  })

  test('outside the range does not count', async () => {
    await withDatabase(async (database) => {
      const desk = entry(database, 'DESK', 'CARD', 5000, '2026-09-15')
      line(database, desk, 'WALK_UP', 900)

      expect(read(database, revenueBySourceQuery(0, 2000))).toEqual([])
    })
  })
})

describe('refunds (criterion 2)', () => {
  // Exactly refundTicket()'s own shape (server/utils/refunds.ts): no reverses_entry_id set,
  // the same as every real refund the running system posts.
  test('a card refund reads as a positive magnitude, with no reverses_entry_id set', async () => {
    await withDatabase(async (database) => {
      const original = entry(database, 'DESK', 'CARD', 1000, '2026-09-15', null, 1000)
      line(database, original, 'WALK_UP', 1000)
      const refund = entry(database, 'DESK', 'CARD', 1100, '2026-09-15', null, -400)
      line(database, refund, 'REFUND', -400)

      const [row] = read<{ refundsPence: number }>(database, seasonRefundsQuery(0, 2000))
      expect(row?.refundsPence).toBe(400)
    })
  })

  test('an entry that sets reverses_entry_id but carries no REFUND line does not count', async () => {
    await withDatabase(async (database) => {
      const original = entry(database, 'DESK', 'CARD', 1000, '2026-09-15', null, 1000)
      line(database, original, 'WALK_UP', 1000)
      // The shape migration/money.ts writes for imported history: reverses_entry_id set, but
      // kind IMPORT rather than REFUND, so it is deliberately outside this live-season figure.
      const imported = entry(database, 'IMPORT', 'CARD', 1100, '2026-09-15', original, -400)
      line(database, imported, 'IMPORT', -400)

      const [row] = read<{ refundsPence: number }>(database, seasonRefundsQuery(0, 2000))
      expect(row?.refundsPence ?? 0).toBe(0)
    })
  })
})

describe('the open variance total (criterion 2)', () => {
  test('sums every open, unwritten-off variance in range', async () => {
    await withDatabase(async (database) => {
      person(database, 'treasurer')
      database.batch([
        ['INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'z-1', '2026-09-14', 600, 500, 100, 'treasurer', 'High'],
        ['INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'z-2', '2026-09-15', 400, 500, -100, 'treasurer', 'Low'],
        ['INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by) VALUES (?, ?, ?, ?, ?, ?)',
          'z-3', '2026-09-16', 500, 500, 0, 'treasurer'],
      ])

      const [row] = read<{ openVariancePence: number }>(database, openVarianceQuery('2026-09-14', '2026-09-16'))
      expect(row?.openVariancePence).toBe(0)
    })
  })
})

const NOON_ON = (day: string): number => Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 1000)

describe('drill-down entries, filtered by declaration and paged in SQL (K-129, criterion 3)', () => {
  test('scoped to the range and an optional source, never a bare array', async () => {
    await withDatabase(async (database) => {
      const desk = entry(database, 'DESK', 'CARD', NOON_ON('2026-09-15'), '2026-09-15')
      line(database, desk, 'WALK_UP', 900)
      const bar = entry(database, 'TILL', 'CARD', NOON_ON('2026-09-15'), '2026-09-15')
      line(database, bar, 'BAR_ITEM', 400)

      const all = read<{ id: string }>(database, ledgerEntriesQuery(ledgerEntriesClause(entriesQuery()), 10, 0))
      expect(all.map(row => row.id).sort()).toEqual([bar, desk].sort())

      const deskOnly = read<{ id: string }>(database, ledgerEntriesQuery(ledgerEntriesClause(entriesQuery({ source: 'is:DESK' })), 10, 0))
      expect(deskOnly.map(row => row.id)).toEqual([desk])
    })
  })

  test('a day outside the happenedAt range is excluded', async () => {
    await withDatabase(async (database) => {
      const inRange = entry(database, 'DESK', 'CARD', NOON_ON('2026-09-15'), '2026-09-15')
      entry(database, 'DESK', 'CARD', NOON_ON('2026-09-01'), '2026-09-01')

      const rowsFound = read<{ id: string }>(database, ledgerEntriesQuery(ledgerEntriesClause(entriesQuery({ happenedAt: 'is:2026-09-15' })), 10, 0))
      expect(rowsFound.map(row => row.id)).toEqual([inRange])
    })
  })

  test('tender narrows the drill-down, unlike the CARD-only revenue figure', async () => {
    await withDatabase(async (database) => {
      const card = entry(database, 'DESK', 'CARD', NOON_ON('2026-09-15'), '2026-09-15')
      const comp = entry(database, 'DESK', 'COMP', NOON_ON('2026-09-15'), '2026-09-15')

      const compOnly = read<{ id: string }>(database, ledgerEntriesQuery(ledgerEntriesClause(entriesQuery({ tender: 'is:COMP' })), 10, 0))
      expect(compOnly.map(row => row.id)).toEqual([comp])
      expect(card).not.toBe(comp)
    })
  })
})
