import { describe, expect, test } from 'bun:test'
import { boundFrom } from '../../scripts/seed/statements'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The ledger names its till session and a movement names its bar (F-105.1, F-202): nullable, bare
// columns rather than a rebuild, since neither table can rebuild (0010, 4.2).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function columnsOf(database: TestDatabase, table: string): { name: string, notnull: number }[] {
  return rows(database, `SELECT name, "notnull" FROM pragma_table_info('${table}')`)
}

// A stand-in binding is enough: postEntry only builds statements, it never awaits one, the same
// reasoning scripts/seed/money.ts relies on to reach it outside a Nitro request.
async function ledgerWriter(): Promise<typeof import('../../server/utils/ledger')> {
  const globals = globalThis as { __env__?: Record<string, unknown> }
  globals.__env__ = { ...globals.__env__, DB: globals.__env__?.DB ?? {} }
  return import('../../server/utils/ledger')
}

describe('ledger_entries.till_session_id (F-105.1, F-202)', () => {
  test('the column exists, nullable, no foreign key', async () => {
    await withDatabase((database) => {
      const column = columnsOf(database, 'ledger_entries').find(c => c.name === 'till_session_id')
      expect(column).toBeDefined()
      expect(column!.notnull).toBe(0)
      const fks = rows<{ table: string }>(database, `SELECT "table" FROM pragma_foreign_key_list('ledger_entries')`)
      expect(fks.some(fk => fk.table === 'till_sessions')).toBe(false)
    })
  })

  test('postEntry writes the till session id on the unconditional insert branch', async () => {
    const { postEntry } = await ledgerWriter()
    await withDatabase((database) => {
      const posted = postEntry({
        source: 'TILL',
        tender: 'NONE',
        tillSessionId: 'sess-1',
        lines: [{ kind: 'BAR_ITEM', amountPence: 0, qty: 1 }],
      })
      database.batch(boundFrom(posted.statements))
      const [row] = rows<{ till_session_id: string | null }>(database, 'SELECT till_session_id FROM ledger_entries WHERE id = ?', posted.id)
      expect(row?.till_session_id).toBe('sess-1')
    })
  })

  test('postEntry leaves it null when no session is supplied', async () => {
    const { postEntry } = await ledgerWriter()
    await withDatabase((database) => {
      const posted = postEntry({
        source: 'DESK',
        tender: 'CARD',
        lines: [{ kind: 'BAR_ITEM', amountPence: 500, qty: 1 }],
      })
      database.batch(boundFrom(posted.statements))
      const [row] = rows<{ till_session_id: string | null }>(database, 'SELECT till_session_id FROM ledger_entries WHERE id = ?', posted.id)
      expect(row?.till_session_id).toBeNull()
    })
  })
})

describe('stock_movements.location_venue_id (F-202)', () => {
  test('the column exists, nullable, no foreign key', async () => {
    await withDatabase((database) => {
      const column = columnsOf(database, 'stock_movements').find(c => c.name === 'location_venue_id')
      expect(column).toBeDefined()
      expect(column!.notnull).toBe(0)
      const fks = rows<{ table: string }>(database, `SELECT "table" FROM pragma_foreign_key_list('stock_movements')`)
      expect(fks.some(fk => fk.table === 'venues')).toBe(false)
    })
  })
})
