import { describe, expect, test } from 'bun:test'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { countStatements, stocktakeLinesQuery, stocktakeByIdQuery, openStocktakeQuery } from '#server/utils/stocktakes'
import type { TestDatabase } from '#tests/helpers/database'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'

// F-115 on the real migrations: one open stocktake at a time, and the atomic apply that chains
// `changes()` through an UPDATE, an audit row and however many adjustment movements follow.

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

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  insert(database, 'users', { id, email: `person-${suffix}@example.invalid`, name: `Person ${suffix}` })
  return id
}

function bottle(database: TestDatabase, suffix = '1'): string {
  const id = `item-${suffix}`
  insert(database, 'bar_items', { id, name: `Gin ${suffix}`, unit: 'ML' })
  return id
}

function readOne<T>(database: TestDatabase, statement: ReturnType<typeof openStocktakeQuery>): T | undefined {
  const [sql, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, sql, ...parameters)[0]
}

describe('at most one stocktake is open at a time (F-115 criterion 1)', () => {
  test('a second open insert is a no-op held by the partial unique index', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      database.batch([[
        `INSERT INTO stocktakes (id, status, opened_by) VALUES (?, 'OPEN', ?)
         ON CONFLICT (status) WHERE status = 'OPEN' DO NOTHING`, 'st-1', opener,
      ]])
      database.batch([[
        `INSERT INTO stocktakes (id, status, opened_by) VALUES (?, 'OPEN', ?)
         ON CONFLICT (status) WHERE status = 'OPEN' DO NOTHING`, 'st-2', opener,
      ]])

      const open = rows<{ id: string }>(database, `SELECT id FROM stocktakes WHERE status = 'OPEN'`)
      expect(open).toEqual([{ id: 'st-1' }])
    })
  })

  test('a plain second INSERT with no conflict clause is refused outright', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      expect(() => insert(database, 'stocktakes', { id: 'st-2', status: 'OPEN', opened_by: opener })).toThrow()
    })
  })

  test('a second stocktake may open once the first is applied', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'APPLIED', opened_by: opener, opened_at: 0, applied_by: opener, applied_at: 1 })
      insert(database, 'stocktakes', { id: 'st-2', status: 'OPEN', opened_by: opener })

      const held = readOne<Stocktake>(database, openStocktakeQuery())
      expect(held?.id).toBe('st-2')
    })
  })
})

describe('one line per item, blank distinct from an entered zero (F-115 criterion 2)', () => {
  test('a stocked item appears once per stocktake', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const itemId = bottle(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10 })
      expect(() => insert(database, 'stocktake_lines', { id: 'l-2', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10 })).toThrow()
    })
  })

  test('counted_qty is nullable, and null is not zero', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const itemId = bottle(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10, counted_qty: null })

      const [statement, ...parameters] = boundStatement(database, stocktakeLinesQuery('st-1'))
      const [line] = rows<StocktakeLine>(database, statement, ...parameters)
      expect(line!.countedQty).toBeNull()
    })
  })

  // Decision 0099 (issue 1322): a count can come from tonight's bar shift, so each line says who
  // entered it, and the Bar Manager reviews every line before Apply.
  test('a count records who entered it, and clearing it clears that too', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const counter = person(database, '2')
      const itemId = bottle(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10 })

      database.batch(countStatements('st-1', [{ itemId, counted: 9 }], counter).map(statement => boundStatement(database, statement)))
      const [statement, ...parameters] = boundStatement(database, stocktakeLinesQuery('st-1'))
      expect(rows<StocktakeLine & { countedByName: string | null }>(database, statement, ...parameters)[0])
        .toMatchObject({ countedQty: 9, countedByName: 'Person 2' })

      database.batch(countStatements('st-1', [{ itemId, counted: null }], counter).map(one => boundStatement(database, one)))
      expect(rows(database, `SELECT counted_qty, counted_by FROM stocktake_lines WHERE id = 'l-1'`))
        .toEqual([{ counted_qty: null, counted_by: null }])
    })
  })

  test('a stocktake applied in the meantime takes none of a count', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const itemId = bottle(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'APPLIED', opened_by: opener, opened_at: 0, applied_by: opener, applied_at: 1 })
      insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10 })

      database.batch(countStatements('st-1', [{ itemId, counted: 3 }], opener).map(statement => boundStatement(database, statement)))
      expect(rows(database, `SELECT counted_qty, counted_by FROM stocktake_lines WHERE id = 'l-1'`))
        .toEqual([{ counted_qty: null, counted_by: null }])
    })
  })

  test('a negative count does not exist to record', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const itemId = bottle(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      expect(() => insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10, counted_qty: -1 })).toThrow()
    })
  })
})

describe('applying chains changes() through the audit row to the adjustment movements (F-115 criteria 4, 5)', () => {
  function open(database: TestDatabase): { opener: string, itemId: string } {
    const opener = person(database)
    const itemId = bottle(database)
    insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
    insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: itemId, expected_qty: 10, counted_qty: 7 })
    return { opener, itemId }
  }

  const applyBatch = (opener: string): [string, ...unknown[]][] => [
    [`UPDATE stocktakes SET status = 'APPLIED', applied_by = ?, applied_at = unixepoch() WHERE id = 'st-1' AND status = 'OPEN'`, opener],
    [`INSERT INTO audit_log (id, actor_id, action, target, detail) SELECT 'au-1', ?, 'bar.stocktake.applied', 'bar-stocktake:st-1', '{}' WHERE changes() = 1`, opener],
    [`INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
      SELECT lower(hex(randomblob(16))), l.item_id, l.counted_qty - l.expected_qty, 'STOCKTAKE', 'stocktake_lines', l.id, ?
      FROM stocktake_lines l WHERE l.stocktake_id = 'st-1' AND l.counted_qty IS NOT NULL AND l.counted_qty <> l.expected_qty AND changes() = 1`, opener],
  ]

  test('a normal apply writes the audit row and exactly one movement', async () => {
    await withDatabase((database) => {
      const { opener, itemId } = open(database)
      database.batch(applyBatch(opener))

      expect(rows(database, `SELECT id FROM audit_log WHERE id = 'au-1'`)).toHaveLength(1)
      const moves = rows<{ qty: number }>(database, `SELECT qty FROM stock_movements WHERE item_id = ?`, itemId)
      expect(moves).toEqual([{ qty: -3 }])
      expect(rows<{ status: string }>(database, `SELECT status FROM stocktakes WHERE id = 'st-1'`)[0]?.status).toBe('APPLIED')
    })
  })

  test('a second apply against the same stocktake writes nothing further', async () => {
    await withDatabase((database) => {
      const { opener, itemId } = open(database)
      database.batch(applyBatch(opener))
      database.batch([
        [`UPDATE stocktakes SET status = 'APPLIED', applied_by = ?, applied_at = unixepoch() WHERE id = 'st-1' AND status = 'OPEN'`, opener],
        [`INSERT INTO audit_log (id, actor_id, action, target, detail) SELECT 'au-2', ?, 'bar.stocktake.applied', 'bar-stocktake:st-1', '{}' WHERE changes() = 1`, opener],
        [`INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
          SELECT lower(hex(randomblob(16))), l.item_id, l.counted_qty - l.expected_qty, 'STOCKTAKE', 'stocktake_lines', l.id, ?
          FROM stocktake_lines l WHERE l.stocktake_id = 'st-1' AND l.counted_qty IS NOT NULL AND l.counted_qty <> l.expected_qty AND changes() = 1`, opener],
      ])

      expect(rows(database, `SELECT id FROM audit_log WHERE id = 'au-2'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM stock_movements WHERE item_id = ?`, itemId)).toHaveLength(1)
    })
  })

  test('a blank line, once applied, writes no adjustment: the named regression case (criterion 6)', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const counted = bottle(database, 'counted')
      const blank = bottle(database, 'blank')
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: opener })
      insert(database, 'stocktake_lines', { id: 'l-1', stocktake_id: 'st-1', item_id: counted, expected_qty: 10, counted_qty: 7 })
      insert(database, 'stocktake_lines', { id: 'l-2', stocktake_id: 'st-1', item_id: blank, expected_qty: 10, counted_qty: null })

      database.batch(applyBatch(opener))

      expect(rows(database, `SELECT id FROM stock_movements WHERE item_id = ?`, blank)).toEqual([])
      expect(rows(database, `SELECT id FROM stock_movements WHERE item_id = ?`, counted)).toHaveLength(1)
    })
  })
})

describe('a frozen stocktake is read as such (F-115 criterion 5)', () => {
  test('stocktakeByIdQuery reports the applied state', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'APPLIED', opened_by: opener, opened_at: 0, applied_by: opener, applied_at: 5 })
      const held = readOne<Stocktake>(database, stocktakeByIdQuery('st-1'))
      expect(held?.status).toBe('APPLIED')
      expect(held?.appliedAt).toBe(5)
    })
  })
})
