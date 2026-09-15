import { describe, expect, test } from 'bun:test'
import { chargeMovementsQuery, productLinesQuery } from '#server/utils/tab-settlement'
import { MOVEMENT_REASONS } from '#shared/utils/bar'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// F-109 criterion 5 on the real migrations: a void finds exactly its own charge's movements and
// lines, scoped by subquery rather than by a list of ids read back first (CLAUDE.md, 0003).

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

function people(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-staff', 'staff@example.invalid', 'Staff'],
  ])
}

// Stocked and delivered: a SALE movement against an item with nothing on hand is refused by the
// trigger, so the fixture has to be a real one (0071).
function item(database: TestDatabase, id = 'item-1'): string {
  database.batch([
    ['INSERT INTO bar_items (id, name, unit, container_ml) VALUES (?, ?, ?, ?)', id, `Gin ${id}`, 'ML', 700],
    [`INSERT INTO stock_movements (id, item_id, qty, kind, actor_id, unit_cost_pence)
      VALUES (?, ?, 7000, 'DELIVERY', 'u-staff', 1200)`, `${id}-delivery`, id],
  ])
  return id
}

let seq = 0

// A charge and, when asked, the one bar line and stock movement a sale of a stocked drink writes.
function charge(database: TestDatabase, id: string, options: { lines?: number, itemId?: string } = {}): void {
  const lines = options.lines ?? 1
  database.batch([[`
    INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
    VALUES (?, ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', 500, 'u-member')`, id, 1_788_950_000 + (seq += 1)]])
  for (let index = 0; index < lines; index++) {
    const lineId = `${id}-line-${index}`
    database.batch([[`
      INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
      VALUES (?, ?, 'BAR_ITEM', 500, 1, 500)`, lineId, id]])
    if (options.itemId) {
      database.batch([[`
        INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
        VALUES (?, ?, -50, 'SALE', 'ledger_lines', ?, 'u-staff')`, `${lineId}-move`, options.itemId, lineId]])
    }
  }
}

describe('a void reads its own charge, scoped by subquery (F-109 criterion 5)', () => {
  test('it finds the movements its own lines caused and no other charge\'s', async () => {
    await withDatabase((database) => {
      people(database)
      const itemId = item(database)
      charge(database, 'charge-1', { lines: 2, itemId })
      charge(database, 'charge-2', { lines: 1, itemId })

      const found = read<{ id: string }>(database, chargeMovementsQuery('charge-1')).map(row => row.id)
      expect(found.sort()).toEqual(['charge-1-line-0-move', 'charge-1-line-1-move'])
    })
  })

  // The shape the old IN list could not answer at all: `sql.join([])` renders `IN ()`, which is a
  // syntax error rather than an empty result.
  test('a charge with no lines at all answers empty rather than failing', async () => {
    await withDatabase((database) => {
      people(database)
      charge(database, 'charge-1', { lines: 0 })

      expect(read(database, chargeMovementsQuery('charge-1'))).toEqual([])
    })
  })

  test('a charge whose lines moved no stock answers empty', async () => {
    await withDatabase((database) => {
      people(database)
      charge(database, 'charge-1', { lines: 1 })

      expect(read(database, chargeMovementsQuery('charge-1'))).toEqual([])
    })
  })

  test('a holder\'s lines are read through their own charges, not through a list of ids', async () => {
    await withDatabase((database) => {
      people(database)
      charge(database, 'charge-1', { lines: 2 })
      charge(database, 'charge-2', { lines: 1 })
      database.batch([[`
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES ('other', ?, '2026-09-09', 'TILL', 'CARD', 'u-staff', 500)`, 1_788_951_000]])
      database.batch([[`
        INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
        VALUES ('other-line', 'other', 'BAR_ITEM', 500, 1, 500)`]])

      const found = read<{ entryId: string }>(database, productLinesQuery('u-member'))
      expect(found.map(row => row.entryId).sort()).toEqual(['charge-1', 'charge-1', 'charge-2'])
    })
  })

  test('a holder with no charges reads no lines', async () => {
    await withDatabase((database) => {
      people(database)

      expect(read(database, productLinesQuery('u-member'))).toEqual([])
    })
  })
})

// 0011 and F-204: the vocabulary is what the waste report groups by, so an operator's prose may
// not land in it. The prose has a column of its own on the entry that carries the void.
describe('a void credit writes a vocabulary reason, not the operator\'s prose', () => {
  test('COUNT_CORRECTION is the reason a credit uses, and it is in the vocabulary', () => {
    expect(MOVEMENT_REASONS).toContain('COUNT_CORRECTION')
  })
})
