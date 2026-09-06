import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock, londonClock, londonParts } from '#shared/utils/london'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'

// A session is a wall clock on a London day, not an instant. That is the whole of why the times
// are stored as text, and the DST case below is the reason the story asks for it (0014, G-112).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'trainer@example.invalid', 'A Trainer'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-111', 'TECH', 'MODULE', 'Lighting Fundamentals', 'ACTIVE'],
  ])
}

function schedule(database: TestDatabase, columns: Record<string, unknown> = {}): void {
  const values = {
    id: 's1',
    held_on: '2027-01-14',
    starts_at: '19:00',
    ends_at: '21:00',
    capacity: 20,
    trainer_id: 'u1',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO training_sessions (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

describe('a session carries a day, a wall clock and a capacity (G-112 criterion 1)', () => {
  test('capacity is between one and sixty', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => schedule(database, { id: 's-none', capacity: 0 })).toThrow()
      expect(() => schedule(database, { id: 's-many', capacity: 61 })).toThrow()
      schedule(database, { id: 's-one', capacity: 1 })
      schedule(database, { id: 's-sixty', capacity: 60 })
      expect(rows(database, 'SELECT id FROM training_sessions')).toHaveLength(2)
    })
  })

  test('a session ends after it starts', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => schedule(database, { starts_at: '21:00', ends_at: '19:00' })).toThrow()
      expect(() => schedule(database, { id: 's-same', starts_at: '19:00', ends_at: '19:00' })).toThrow()
    })
  })

  test('a status outside the five is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => schedule(database, { status: 'HAPPENING' })).toThrow()
      for (const [index, status] of ['PLANNED', 'OPEN', 'FULL', 'DELIVERED', 'CANCELLED'].entries()) {
        schedule(database, { id: `s-${index}`, status })
      }
      expect(rows(database, 'SELECT id FROM training_sessions')).toHaveLength(5)
    })
  })

  test('a session teaches one or more modules, each named once', async () => {
    await withDatabase((database) => {
      seed(database)
      schedule(database)
      database.batch([[`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm1', 's1', 'TECH-111')`]])
      expect(() => database.batch([
        [`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm2', 's1', 'TECH-111')`],
      ])).toThrow()
    })
  })

  test('a module a session teaches cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      seed(database)
      schedule(database)
      database.batch([[`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm1', 's1', 'TECH-111')`]])
      expect(() => database.batch([[`DELETE FROM modules WHERE id = 'TECH-111'`]])).toThrow()
      // The join dies with the session, because it is the session's own record of what it taught.
      database.batch([[`DELETE FROM training_sessions WHERE id = 's1'`]])
      expect(rows(database, 'SELECT id FROM session_modules')).toHaveLength(0)
    })
  })
})

// Named regression case (K-121). The old estate stored an instant and a 19:00 session moved by an
// hour twice a year; this stores the wall clock, so the clocks change and the session does not.
describe('a session survives a clock change (G-112 criterion 5)', () => {
  test('a stored 19:00 is 19:00 London on both sides of the spring change', async () => {
    await withDatabase((database) => {
      seed(database)
      // 29 March 2026 is the spring forward; one session each side of it.
      schedule(database, { id: 'gmt', held_on: '2026-03-28', starts_at: '19:00', ends_at: '21:00' })
      schedule(database, { id: 'bst', held_on: '2026-03-30', starts_at: '19:00', ends_at: '21:00' })

      const stored = rows<{ id: string, starts: string }>(
        database,
        'SELECT id, starts_at starts FROM training_sessions ORDER BY held_on',
      )
      expect(stored.map(row => row.starts)).toEqual(['19:00', '19:00'])
    })
  })

  test('read as an instant, each is a different UTC time and the same London one', async () => {
    // The property the text column protects: the same wall clock is a different instant either
    // side of the change, and it is the wall clock a member turns up for.
    const gmt = fromLondonWallClock(2026, 3, 28, 19, 0)
    const bst = fromLondonWallClock(2026, 3, 30, 19, 0)

    expect(gmt.toISOString()).toBe('2026-03-28T19:00:00.000Z')
    expect(bst.toISOString()).toBe('2026-03-30T18:00:00.000Z')
    expect(londonClock(gmt)).toBe('19:00')
    expect(londonClock(bst)).toBe('19:00')
  })

  test('the same holds across the autumn change', async () => {
    // 25 October 2026 is the fall back.
    const bst = fromLondonWallClock(2026, 10, 24, 19, 0)
    const gmt = fromLondonWallClock(2026, 10, 26, 19, 0)

    expect(londonClock(bst)).toBe('19:00')
    expect(londonClock(gmt)).toBe('19:00')
    expect(bst.toISOString()).not.toBe('2026-10-24T19:00:00.000Z')
    expect(gmt.toISOString()).toBe('2026-10-26T19:00:00.000Z')
    expect(londonParts(gmt).hour).toBe(19)
  })
})

// `changes()` names the row count of the statement just before it on this connection, so the
// cancel route's audit insert can read whether *this* UPDATE changed anything (0049).
describe('cancelling a session batches its audit entry, predicated on changes() (0049)', () => {
  const cancel = (auditId: string): BoundStatement[] => [
    [`UPDATE training_sessions SET status = 'CANCELLED', cancelled_at = 1, cancelled_by = 'u1',
        cancel_reason = 'x', updated_at = 1
      WHERE id = 's1' AND status <> 'CANCELLED'`],
    [`INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ?, 'u1', 'session.cancelled', 'session:s1', '{}'
      WHERE changes() = 1`, auditId],
  ]

  test('the first cancellation writes exactly one audit entry', async () => {
    await withDatabase((database) => {
      seed(database)
      schedule(database)

      database.batch(cancel('a1'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM training_sessions WHERE id = \'s1\'')[0]!.status)
        .toBe('CANCELLED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The loser's own predicate matches nothing even though the row now reads CANCELLED, which a
  // predicate over the resulting state rather than changes() could not tell from a win.
  test('a second attempt on an already-cancelled session writes no further audit entry', async () => {
    await withDatabase((database) => {
      seed(database)
      schedule(database)

      database.batch(cancel('a1'))
      database.batch(cancel('a2'))

      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The route reads this same RETURNING clause to tell a win from a loss (0049).
  test('a losing predicate\'s RETURNING is empty, which is what the route refuses on', async () => {
    await withDatabase((database) => {
      seed(database)
      schedule(database)

      const attempt = (): { id: string }[] => database.raw.prepare(
        `UPDATE training_sessions SET status = 'CANCELLED' WHERE id = 's1' AND status <> 'CANCELLED' RETURNING id`,
      ).all() as { id: string }[]

      expect(attempt()).toHaveLength(1)
      expect(attempt()).toHaveLength(0)
    })
  })
})
