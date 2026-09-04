import { describe, expect, test } from 'bun:test'
import { londonDayOf } from '#shared/utils/ledger'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// I-101 criterion 5: every day, month and season grouping is Europe/London pinned, and an entry
// either side of a DST transition groups to the correct London day (split from money.test.ts).

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

// Criterion 5, and the reason londonDayOf exists rather than a UTC date being good enough.
describe('a day is the London day, on both sides of a transition', () => {
  test('a show that ends after midnight UTC in summer still belongs to its own evening', async () => {
    await withDatabase((database) => {
      seedActor(database)
      // 22:30 UTC on 15 June is 23:30 in London: the same evening.
      const evening = new Date('2026-06-15T22:30:00Z')
      postEntry(database, 'e-bst', 750, { day: londonDayOf(evening) })

      const [row] = rows<{ day: string }>(database, 'SELECT london_day AS day FROM ledger_entries WHERE id = ?', 'e-bst')
      expect(row?.day).toBe('2026-06-15')
    })
  })

  test('and half an hour later it belongs to the next one', () => {
    expect(londonDayOf(new Date('2026-06-15T23:30:00Z'))).toBe('2026-06-16')
  })

  test('the autumn transition does not repeat a day', () => {
    // 2026-10-25 00:30 and 01:30 UTC are 01:30 BST and 01:30 GMT: the same London day, once.
    expect(londonDayOf(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(londonDayOf(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25')
  })
})
