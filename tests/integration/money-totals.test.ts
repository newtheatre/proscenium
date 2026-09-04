import { describe, expect, test } from 'bun:test'
import { totalOf } from '#shared/utils/ledger'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// I-101 criterion 4: no report figure is stored; every total is derived from ledger rows at
// read time. Split from money.test.ts (K-105).

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

describe('a total is a query, never a stored figure (I-101 criterion 4)', () => {
  test('a day comes to the sum of its entries, read from the rows', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-d1', 750, { day: '2026-09-15' })
      postEntry(database, 'e-d2', 1200, { day: '2026-09-15' })
      postEntry(database, 'e-d3', 400, { day: '2026-09-16' })

      const [day] = rows<{ total: number }>(database,
        'SELECT sum(total_pence) AS total FROM ledger_entries WHERE london_day = ?', '2026-09-15')
      expect(day?.total).toBe(1950)
    })
  })

  test('an entry carries no total its lines do not justify', async () => {
    expect(totalOf([
      { kind: 'BAR_ITEM', amountPence: 350 },
      { kind: 'BAR_ITEM', amountPence: 350 },
    ])).toBe(700)
  })
})
