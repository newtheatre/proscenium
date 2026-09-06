import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { buildLoad, reconcileMoney, transformMoney } from '#migration/money'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TicketRow } from '#migration/money'
import type { TestDatabase } from '#tests/helpers/database'

// K-114, I-109, against the real migrations: the generated SQL lands in ledger_entries and
// ledger_lines exactly like any other money path, and reconciles against the source.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// A stand-in for the old proscenium dump: only the columns the transform reads.
function oldEstate(rowsToInsert: TicketRow[]): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY, price_paid INTEGER NOT NULL, refunded_at INTEGER,
      created_at TEXT NOT NULL, price_confidence TEXT NOT NULL DEFAULT 'EXACT'
    );
  `)
  const insert = db.query(
    'INSERT INTO tickets (id, price_paid, refunded_at, created_at, price_confidence) VALUES (?, ?, ?, ?, ?)',
  )
  for (const row of rowsToInsert) insert.run(row.id, row.price_paid, row.refunded_at, row.created_at, row.price_confidence)
  return db
}

function ticket(over: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-1', price_paid: 1250, refunded_at: null,
    created_at: '2023-05-14 19:30:00', price_confidence: 'EXACT', ...over,
  }
}

describe('imported ticket money lands in the ledger under the IMPORT path (K-114, I-109)', () => {
  test('a sale posts one entry and one line, matching the money-path contract', async () => {
    await withDatabase(async (database) => {
      const { entries, lines } = transformMoney([ticket()], new Map(), new Map())
      database.raw.exec(buildLoad(entries, lines))

      const [entry] = rows<{ source: string, tender: string, total_pence: number, london_day: string }>(
        database, 'SELECT source, tender, total_pence, london_day FROM ledger_entries',
      )
      expect(entry).toMatchObject({ source: 'IMPORT', tender: 'CARD', total_pence: 1250 })

      const [line] = rows<{ kind: string, amount_pence: number }>(database, 'SELECT kind, amount_pence FROM ledger_lines')
      expect(line).toMatchObject({ kind: 'IMPORT', amount_pence: 1250 })
    })
  })

  test('a refunded ticket posts two entries, and both remain visible (0004, 0010)', async () => {
    await withDatabase(async (database) => {
      const { entries, lines } = transformMoney([ticket({ refunded_at: 1_700_000_000_000 })], new Map(), new Map())
      database.raw.exec(buildLoad(entries, lines))

      expect(rows(database, 'SELECT id FROM ledger_entries')).toHaveLength(2)
      const net = rows<{ total: number }>(database, 'SELECT coalesce(sum(total_pence), 0) AS total FROM ledger_entries')[0]!.total
      expect(net).toBe(0)
    })
  })

  test('imported rows are append-only exactly like any other ledger entry (0010)', async () => {
    await withDatabase(async (database) => {
      const { entries, lines } = transformMoney([ticket()], new Map(), new Map())
      database.raw.exec(buildLoad(entries, lines))

      const [{ id }] = rows<{ id: string }>(database, 'SELECT id FROM ledger_entries')
      expect(() => database.raw.exec(`UPDATE ledger_entries SET total_pence = 0 WHERE id = '${id}'`)).toThrow()
      expect(() => database.raw.exec(`DELETE FROM ledger_entries WHERE id = '${id}'`)).toThrow()
    })
  })

  test('a second run over the same tickets writes nothing further', async () => {
    await withDatabase(async (database) => {
      const idMap = new Map<string, string>()
      const refundIdMap = new Map<string, string>()

      const first = transformMoney([ticket()], idMap, refundIdMap)
      database.raw.exec(buildLoad(first.entries, first.lines))

      const second = transformMoney([ticket()], idMap, refundIdMap)
      database.raw.exec(buildLoad(second.entries, second.lines))

      expect(rows(database, 'SELECT id FROM ledger_entries')).toHaveLength(1)
    })
  })
})

describe('reconciliation catches a mismatch between the source and the target (I-109 criterion 2)', () => {
  test('a matching import reconciles clean', async () => {
    await withDatabase(async (database) => {
      const tickets = [ticket({ id: 't1', price_paid: 1000 }), ticket({ id: 't2', price_paid: 500, refunded_at: 1_700_000_000_000 })]
      const source = oldEstate(tickets)
      try {
        const result = transformMoney(tickets, new Map(), new Map())
        database.raw.exec(buildLoad(result.entries, result.lines))

        const reconciliation = reconcileMoney(source, database.raw, result.summary)
        expect(reconciliation).toEqual({ ok: true, problems: [] })
      }
      finally {
        source.close()
      }
    })
  })

  test('a target missing a row fails reconciliation rather than passing silently', async () => {
    await withDatabase(async (database) => {
      const tickets = [ticket({ id: 't1', price_paid: 1000 })]
      const source = oldEstate(tickets)
      try {
        const result = transformMoney(tickets, new Map(), new Map())
        // Nothing applied to the target at all: simulates a load that never landed.

        const reconciliation = reconcileMoney(source, database.raw, result.summary)
        expect(reconciliation.ok).toBe(false)
        expect(reconciliation.problems.length).toBeGreaterThan(0)
      }
      finally {
        source.close()
      }
    })
  })
})
