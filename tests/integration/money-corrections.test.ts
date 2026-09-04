import { describe, expect, test } from 'bun:test'
import { netPence } from '#shared/utils/ledger'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// I-101 criterion 3: a correction is a new entry referencing what it supersedes; both remain
// visible, and net positions are computed across the chain. Split from money.test.ts (K-105).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const ACTOR = 'u-treasurer'

function seedActor(database: TestDatabase): void {
  database.batch([[
    'INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)',
    ACTOR, 'treasurer@example.invalid', 'A Treasurer',
  ]])
}

function postEntry(database: TestDatabase, id: string, totalPence: number, options: {
  reverses?: string
  day?: string
  lines?: { kind: string, amountPence: number }[]
} = {}): void {
  const lines = options.lines ?? [{ kind: 'TICKET_COLLECTION', amountPence: totalPence }]
  database.batch([
    [
      `INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, reverses_entry_id)
       VALUES (?, unixepoch(), ?, 'DESK', 'CARD', ?, ?, ?)`,
      id, options.day ?? '2026-09-15', ACTOR, totalPence, options.reverses ?? null,
    ],
    ...lines.map((line, index): [string, ...unknown[]] => [
      'INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty) VALUES (?, ?, ?, ?, 1)',
      `${id}-l${index}`, id, line.kind, line.amountPence,
    ]),
  ])
}

describe('a correction supersedes and nets (I-101 criterion 3)', () => {
  test('the double refund: two reversals of one entry are two facts, and the net is right', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-take', 1000)
      postEntry(database, 'e-back-1', -500, { reverses: 'e-take', lines: [{ kind: 'REFUND', amountPence: -500 }] })
      postEntry(database, 'e-back-2', -500, { reverses: 'e-take', lines: [{ kind: 'REFUND', amountPence: -500 }] })

      const chain = rows<{ id: string, totalPence: number, reversesEntryId: string | null }>(database, `
        SELECT id, total_pence AS totalPence, reverses_entry_id AS reversesEntryId
        FROM ledger_entries WHERE id = ? OR reverses_entry_id = ?`, 'e-take', 'e-take')

      expect(chain).toHaveLength(3)
      expect(netPence(chain)).toBe(0)
    })
  })

  test('a partial refund leaves what was kept, and both rows remain', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-part', 1000)
      postEntry(database, 'e-part-back', -250, { reverses: 'e-part', lines: [{ kind: 'REFUND', amountPence: -250 }] })

      const chain = rows<{ id: string, totalPence: number, reversesEntryId: string | null }>(database, `
        SELECT id, total_pence AS totalPence, reverses_entry_id AS reversesEntryId
        FROM ledger_entries WHERE id = ? OR reverses_entry_id = ?`, 'e-part', 'e-part')

      expect(netPence(chain)).toBe(750)
      expect(chain).toHaveLength(2)
    })
  })
})
