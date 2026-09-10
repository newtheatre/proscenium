import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// I-107. The trigger that enforces a close, against the real migrated schema: a day is locked
// if the latest period_locks row covering it is CLOSED, whatever its close/reopen history.

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

// Exactly lockStatement()'s insert.
function lock(database: TestDatabase, id: string, fromDay: string, toDay: string, action: 'CLOSED' | 'REOPENED', at = 0): void {
  database.raw.prepare(
    `INSERT INTO period_locks (id, from_day, to_day, action, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, fromDay, toDay, action, ACTOR, at)
}

// Exactly postEntry()'s insert, minus the trigger's guard which this file is testing.
function postEntry(database: TestDatabase, id: string, day: string): void {
  database.batch([[
    `INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
     VALUES (?, unixepoch(), ?, 'DESK', 'CARD', ?, 750)`,
    id, day, ACTOR,
  ]])
}

describe('a closed period refuses a new entry (criterion 2)', () => {
  test('an entry dated inside a closed range is refused', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED')
      expect(() => postEntry(database, 'e-1', '2026-09-15')).toThrow()
      expect(rows(database, 'SELECT id FROM ledger_entries')).toEqual([])
    })
  })

  test('an entry dated outside the closed range is unaffected', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED')
      postEntry(database, 'e-1', '2026-10-01')
      expect(rows(database, 'SELECT id FROM ledger_entries')).toEqual([{ id: 'e-1' }])
    })
  })

  test('a correction dated in the open period is allowed, whatever it corrects', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED')
      // The entry it corrects need not exist for this trigger's purposes: only NEW.london_day
      // is judged, matching criterion 2's "a correction posts in the open period".
      postEntry(database, 'e-correction', '2026-10-02')
      expect(rows(database, 'SELECT id FROM ledger_entries')).toEqual([{ id: 'e-correction' }])
    })
  })

  test('with no lock at all, every day is open', async () => {
    await withDatabase((database) => {
      seedActor(database)
      postEntry(database, 'e-1', '2026-09-15')
      expect(rows(database, 'SELECT id FROM ledger_entries')).toEqual([{ id: 'e-1' }])
    })
  })
})

describe('reopening is a new row, and the latest row for a range wins', () => {
  test('a reopened range accepts entries again', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED', 1)
      lock(database, 'lock-2', '2026-09-01', '2026-09-30', 'REOPENED', 2)
      postEntry(database, 'e-1', '2026-09-15')
      expect(rows(database, 'SELECT id FROM ledger_entries')).toEqual([{ id: 'e-1' }])
    })
  })

  test('re-closing after a reopen refuses again', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED', 1)
      lock(database, 'lock-2', '2026-09-01', '2026-09-30', 'REOPENED', 2)
      lock(database, 'lock-3', '2026-09-01', '2026-09-30', 'CLOSED', 3)
      expect(() => postEntry(database, 'e-1', '2026-09-15')).toThrow()
    })
  })

  test('the original close row itself is never mutated by a reopen', async () => {
    await withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED', 1)
      lock(database, 'lock-2', '2026-09-01', '2026-09-30', 'REOPENED', 2)
      expect(rows(database, `SELECT id, action FROM period_locks WHERE id = 'lock-1'`))
        .toEqual([{ id: 'lock-1', action: 'CLOSED' }])
    })
  })
})

describe('the range and the action are refused by the database, not trusted to the caller', () => {
  test('a range ending before it starts is refused', async () => {
    await withDatabase((database) => {
      seedActor(database)
      expect(() => lock(database, 'lock-bad', '2026-09-30', '2026-09-01', 'CLOSED')).toThrow()
    })
  })

  test('an action outside the two the estate uses is refused', async () => {
    await withDatabase((database) => {
      seedActor(database)
      expect(() => lock(database, 'lock-bad', '2026-09-01', '2026-09-30', 'PENDING' as never)).toThrow()
    })
  })
})

describe('a defined term is where the range a close names can come from', () => {
  // Exactly defineTerm()'s insert.
  function definePeriod(database: TestDatabase, id: string, label: string, fromDay: string, toDay: string): void {
    database.raw.prepare(
      `INSERT INTO periods (id, label, from_day, to_day, created_by) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, label, fromDay, toDay, ACTOR)
  }

  test('a well-formed term is written', async () => {
    await withDatabase((database) => {
      seedActor(database)
      definePeriod(database, 'term-1', 'Autumn term', '2026-09-21', '2026-12-11')
      expect(rows(database, `SELECT label FROM periods WHERE id = 'term-1'`)).toEqual([{ label: 'Autumn term' }])
    })
  })

  test('a term ending before it starts is refused', async () => {
    await withDatabase((database) => {
      seedActor(database)
      expect(() => definePeriod(database, 'term-bad', 'Autumn term', '2026-12-11', '2026-09-21')).toThrow()
    })
  })

  test('closing the range a term named locks it exactly like any other close', async () => {
    await withDatabase((database) => {
      seedActor(database)
      definePeriod(database, 'term-1', 'Autumn term', '2026-09-21', '2026-12-11')
      lock(database, 'lock-1', '2026-09-21', '2026-12-11', 'CLOSED')
      expect(() => postEntry(database, 'e-1', '2026-10-01')).toThrow()
    })
  })
})
