import { describe, expect, test } from 'bun:test'
import { londonDayOf, netPence, totalOf } from '#shared/utils/ledger'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Named regression cases (K-121). Money is integer pence in one append-only ledger (0004), and
// these run the real migrations, so the triggers are the ones production has.

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

describe('the ledger is append-only, and the database is what says so (I-101 criterion 2)', () => {
  test('an entry cannot be updated, whatever the caller intended', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-1', 750)

      expect(() => database.batch([['UPDATE ledger_entries SET total_pence = ? WHERE id = ?', 0, 'e-1']])).toThrow()
      expect(() => database.batch([['UPDATE ledger_entries SET london_day = ? WHERE id = ?', '2026-09-16', 'e-1']])).toThrow()
    })
  })

  test('an entry cannot be deleted, so a mistake stays visible beside its correction', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-2', 750)

      expect(() => database.batch([['DELETE FROM ledger_entries WHERE id = ?', 'e-2']])).toThrow()
      expect(rows(database, 'SELECT id FROM ledger_entries WHERE id = ?', 'e-2')).toHaveLength(1)
    })
  })

  test('a line cannot be edited either: the entry is corrected, not the line', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-3', 750)

      expect(() => database.batch([['UPDATE ledger_lines SET amount_pence = 0 WHERE entry_id = ?', 'e-3']])).toThrow()
      expect(() => database.batch([['DELETE FROM ledger_lines WHERE entry_id = ?', 'e-3']])).toThrow()
    })
  })

  test('an entry cannot claim to reverse itself', async () => {
    await withDatabase((database) => {
      seedActor(database)
      expect(() => database.batch([[
        `INSERT INTO ledger_entries (id, london_day, source, tender, actor_id, total_pence, reverses_entry_id)
         VALUES (?, '2026-09-15', 'DESK', 'CARD', ?, 750, ?)`,
        'e-loop', ACTOR, 'e-loop',
      ]])).toThrow()
    })
  })

  test('a source or tender the estate does not use is refused by the database (0033)', async () => {
    await withDatabase((database) => {
      seedActor(database)
      expect(() => database.batch([[
        `INSERT INTO ledger_entries (id, london_day, source, tender, actor_id, total_pence)
         VALUES (?, '2026-09-15', 'CARRIER_PIGEON', 'CARD', ?, 750)`,
        'e-bad-source', ACTOR,
      ]])).toThrow()
      expect(() => database.batch([[
        `INSERT INTO ledger_entries (id, london_day, source, tender, actor_id, total_pence)
         VALUES (?, '2026-09-15', 'DESK', 'CHEQUE', ?, 750)`,
        'e-bad-tender', ACTOR,
      ]])).toThrow()
    })
  })

  // 0033: the kind is held in code, so the database takes one it has never heard of. The write
  // path is what refuses it, and check:ledger is what keeps the write path the only way in.
  test('a line kind is not the database\'s business', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-4', 500, { lines: [{ kind: 'MEMBERSHIP', amountPence: 500 }] })
      expect(rows(database, 'SELECT kind FROM ledger_lines WHERE entry_id = ?', 'e-4')).toHaveLength(1)
    })
  })
})

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
