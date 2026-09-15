import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// A catalogue listing scanning the whole ledger per variant, and a void scanning the whole of
// stock_movements without one, are the two scans decision 0003 adds these indexes to close.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function indexesOn(database: TestDatabase, table: string): string[] {
  return rows<{ name: string }>(database, `SELECT name FROM pragma_index_list('${table}')`).map(index => index.name)
}

describe('the two scans a full catalogue listing and a void used to force (0003)', () => {
  test('ledger_lines indexes product_variant_id', async () => {
    await withDatabase((database) => {
      expect(indexesOn(database, 'ledger_lines')).toContain('ledger_lines_variant')
    })
  })

  test('stock_movements indexes (ref_table, ref_id)', async () => {
    await withDatabase((database) => {
      expect(indexesOn(database, 'stock_movements')).toContain('stock_movements_ref')
    })
  })
})
