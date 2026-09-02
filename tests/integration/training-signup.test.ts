import { describe, expect, test } from 'bun:test'
import { placesFrom, refreshBadgeStatement, rejoinStatement, signUpOrderStatement, signUpStatement, withdrawStatement } from '#shared/utils/training-signup'
import type { SignUpOrder } from '#shared/utils/training-signup'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The sign-up table holds an order and nothing else: no position column, no stored status, no
// waitlist table. Every claim here is about what the database itself enforces (G-105, G-106).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase, capacity = 2): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-trainer', 'trainer@example.invalid', 'A Trainer'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-111', 'TECH', 'MODULE', 'Lighting Fundamentals', 'ACTIVE'],
    [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, status, trainer_id)
      VALUES ('s1', '2027-01-14', '19:00', '21:00', ?, 'OPEN', 'u-trainer')`, capacity],
    [`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm1', 's1', 'TECH-111')`],
  ])
}

function member(database: TestDatabase, id: string): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, `${id}@example.invalid`, `Member ${id}`],
  ])
}

const run = (database: TestDatabase, statement: ReturnType<typeof refreshBadgeStatement>): void =>
  database.batch([boundStatement(database, statement)])

const read = <T>(database: TestDatabase, statement: ReturnType<typeof refreshBadgeStatement>): T[] => {
  const [text, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(text).all(...parameters as never[]) as T[]
}

const signUp = (database: TestDatabase, userId: string, at: number): void => {
  run(database, signUpStatement(`a-${userId}`, 's1', userId, at))
}

const order = (database: TestDatabase): SignUpOrder[] =>
  read<SignUpOrder>(database, signUpOrderStatement('s1'))

describe('the sign-up table holds an order, not a place (G-105 criterion 1)', () => {
  test('no column anywhere stores a place, a position or a waitlist state', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('session_attendees')`)
        .map(column => column.name)
      expect(columns).toEqual([
        'id', 'session_id', 'user_id', 'status', 'source', 'signed_up_at', 'marked_at', 'marked_by', 'created_at',
      ])
      expect(columns.filter(name => /position|waitlist|place/.test(name))).toEqual([])

      // Nor is there a table to hold one.
      expect(rows<{ name: string }>(
        database,
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%waitlist%'`,
      )).toEqual([])
    })
  })

  test('one live row per person per session, so a double sign-up writes nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')

      signUp(database, 'u-one', 100)
      expect(read(database, signUpStatement('a-again', 's1', 'u-one', 200))).toEqual([])
      expect(order(database)).toHaveLength(1)
    })
  })

  test('sign-up past capacity is accepted, because it never refuses for fullness', async () => {
    await withDatabase((database) => {
      seed(database, 2)
      for (const [index, id] of ['u-one', 'u-two', 'u-three', 'u-four'].entries()) {
        member(database, id)
        signUp(database, id, 100 + index)
      }

      const places = placesFrom(order(database), 2)
      expect(places.map(place => place.userId)).toEqual(['u-one', 'u-two', 'u-three', 'u-four'])
      expect(places.map(place => place.placed)).toEqual([true, true, false, false])
      expect(places[3]!.waitlistPosition).toBe(2)
    })
  })

  test('a status outside the four is refused, and the marks are already vocabulary', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      expect(() => database.batch([
        [`INSERT INTO session_attendees (id, session_id, user_id, status, signed_up_at)
          VALUES ('a-bad', 's1', 'u-one', 'PROMOTED', 100)`],
      ])).toThrow()

      for (const status of ['SIGNED_UP', 'CANCELLED', 'ATTENDED', 'ABSENT']) {
        database.batch([[
          `UPDATE session_attendees SET status = ? WHERE session_id = 's1' AND user_id = 'u-one'`,
          status,
        ]])
      }
    })
  })

  test('a sign-up dies with its session and never with its module', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      signUp(database, 'u-one', 100)

      expect(() => database.batch([[`DELETE FROM modules WHERE id = 'TECH-111'`]])).toThrow()
      database.batch([[`DELETE FROM training_sessions WHERE id = 's1'`]])
      expect(rows(database, 'SELECT id FROM session_attendees')).toHaveLength(0)
    })
  })
})

describe('withdrawing and re-joining goes to the back (criterion 2)', () => {
  test('the row stays, the order moves, and nothing is renumbered', async () => {
    await withDatabase((database) => {
      seed(database, 2)
      for (const [index, id] of ['u-one', 'u-two', 'u-three'].entries()) {
        member(database, id)
        signUp(database, id, 100 + index)
      }
      expect(placesFrom(order(database), 2).find(place => place.userId === 'u-one')?.placed).toBe(true)

      run(database, withdrawStatement('s1', 'u-one'))
      expect(order(database).map(row => row.userId)).toEqual(['u-two', 'u-three'])
      // Never deleted: the row is the evidence they were here, and G-116 marks on it.
      expect(rows(database, 'SELECT id FROM session_attendees')).toHaveLength(3)

      run(database, rejoinStatement('s1', 'u-one', 500))
      const places = placesFrom(order(database), 2)
      expect(places.map(place => place.userId)).toEqual(['u-two', 'u-three', 'u-one'])
      expect(places.find(place => place.userId === 'u-one')?.waitlistPosition).toBe(1)
    })
  })

  test('withdrawing twice writes nothing the second time', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      signUp(database, 'u-one', 100)

      expect(read(database, withdrawStatement('s1', 'u-one'))).toHaveLength(1)
      expect(read(database, withdrawStatement('s1', 'u-one'))).toEqual([])
    })
  })

  test('a marked attendee is the register\'s, so a withdrawal after a mark writes nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      signUp(database, 'u-one', 100)
      database.batch([[`UPDATE session_attendees SET status = 'ATTENDED' WHERE user_id = 'u-one'`]])

      expect(read(database, withdrawStatement('s1', 'u-one'))).toEqual([])
    })
  })

  test('re-joining a session never left writes nothing', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      signUp(database, 'u-one', 100)
      expect(read(database, rejoinStatement('s1', 'u-one', 500))).toEqual([])
      expect(order(database)[0]!.signedUpAt).toBe(100)
    })
  })
})

describe('the FULL badge is a label, not an answer (G-105)', () => {
  test('it is recomputed from the count in the statement that writes it', async () => {
    await withDatabase((database) => {
      seed(database, 2)
      const status = (): string =>
        rows<{ status: string }>(database, `SELECT status FROM training_sessions WHERE id = 's1'`)[0]!.status

      member(database, 'u-one')
      signUp(database, 'u-one', 100)
      run(database, refreshBadgeStatement('s1'))
      expect(status()).toBe('OPEN')

      member(database, 'u-two')
      signUp(database, 'u-two', 200)
      run(database, refreshBadgeStatement('s1'))
      expect(status()).toBe('FULL')

      // Self-healing: the write that would heal a stale badge is the sign-up it suppresses, so
      // a withdrawal has to put it back on its own.
      run(database, withdrawStatement('s1', 'u-one'))
      run(database, refreshBadgeStatement('s1'))
      expect(status()).toBe('OPEN')
    })
  })

  test('a capacity rise heals a badge left reading full', async () => {
    await withDatabase((database) => {
      seed(database, 1)
      member(database, 'u-one')
      signUp(database, 'u-one', 100)
      run(database, refreshBadgeStatement('s1'))
      expect(rows<{ status: string }>(database, `SELECT status FROM training_sessions`)[0]!.status).toBe('FULL')

      database.batch([[`UPDATE training_sessions SET capacity = 4 WHERE id = 's1'`]])
      run(database, refreshBadgeStatement('s1'))
      expect(rows<{ status: string }>(database, `SELECT status FROM training_sessions`)[0]!.status).toBe('OPEN')
    })
  })

  test('it never touches a session that is planned, delivered or cancelled', async () => {
    await withDatabase((database) => {
      for (const status of ['PLANNED', 'DELIVERED', 'CANCELLED']) {
        seed(database)
        database.batch([[`UPDATE training_sessions SET status = ? WHERE id = 's1'`, status]])
        run(database, refreshBadgeStatement('s1'))
        expect(rows<{ status: string }>(database, `SELECT status FROM training_sessions`)[0]!.status).toBe(status)
        database.batch([[`DELETE FROM training_sessions WHERE id = 's1'`], [`DELETE FROM modules`], [`DELETE FROM departments`], [`DELETE FROM users`]])
      }
    })
  })
})

describe('a promotion is claimed before it is sent (G-106 criterion 2)', () => {
  test('the ledger refuses the second claim on one promotion', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')

      const claim = (id: string): number => {
        database.batch([[
          `INSERT INTO notification_log (id, user_id, type, channel, status, session_id, claim, sent_at)
           VALUES (?, 'u-one', 'training.session.promoted', 'EMAIL', 'SENT', 's1', ?, 1)
           ON CONFLICT DO NOTHING`,
          id, 'training.session.promoted:s1:u-one:100',
        ]])
        return rows<{ n: number }>(database, 'SELECT count(*) n FROM notification_log WHERE id = ?', id)[0]!.n
      }

      expect(claim('n-first')).toBe(1)
      expect(claim('n-second')).toBe(0)
      expect(rows(database, `SELECT id FROM notification_log`)).toHaveLength(1)
    })
  })

  // Criterion 4: the row is the evidence, and only the standard pruning ever removes it.
  test('the claim names its session, so a run can be read back off the ledger', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      database.batch([[
        `INSERT INTO notification_log (id, user_id, type, channel, status, session_id, claim, sent_at)
         VALUES ('n-1', 'u-one', 'training.session.promoted', 'EMAIL', 'SENT', 's1', ?, 1)`,
        'training.session.promoted:s1:u-one:100',
      ]])

      expect(rows<{ session: string }>(
        database,
        `SELECT session_id session FROM notification_log WHERE type = 'training.session.promoted'`,
      )[0]?.session).toBe('s1')
    })
  })
})
