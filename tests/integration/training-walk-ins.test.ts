import { describe, expect, test } from 'bun:test'
import { placesFrom, signUpOrderStatement, signUpStatement, walkInRejoinStatement, walkInStatement, withdrawStatement } from '#shared/utils/training-signup'
import type { SignUpOrder } from '#shared/utils/training-signup'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// A walk-in is somebody the trainer put on the register at the door. It is the same row a sign-up
// makes, marked as what it is, and it goes to the back of the order (G-117).

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

const run = (database: TestDatabase, statement: ReturnType<typeof walkInStatement>): unknown[] => {
  const [text, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(text).all(...parameters as never[]) as unknown[]
}

describe('a walk-in joins the register as a walk-in (G-117 criterion 5)', () => {
  test('the row records how they got there', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      run(database, walkInStatement('a1', 's1', 'u-one', 1_800_000_000))

      expect(rows<{ source: string, status: string }>(
        database, `SELECT source, status FROM session_attendees WHERE session_id = 's1'`,
      )).toEqual([{ source: 'WALK_IN', status: 'SIGNED_UP' }])
    })
  })

  test('adding the same person twice leaves one row, so two taps are one walk-in', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      expect(run(database, walkInStatement('a1', 's1', 'u-one', 1_800_000_000))).toHaveLength(1)
      expect(run(database, walkInStatement('a2', 's1', 'u-one', 1_800_000_001))).toHaveLength(0)

      expect(rows(database, `SELECT id FROM session_attendees WHERE session_id = 's1'`)).toHaveLength(1)
    })
  })

  test('somebody already signed up keeps their sign-up, and their place in the order', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      run(database, signUpStatement('a1', 's1', 'u-one', 1_800_000_000))
      expect(run(database, walkInStatement('a2', 's1', 'u-one', 1_800_000_050))).toHaveLength(0)

      expect(rows<{ source: string, signedUpAt: number }>(
        database, `SELECT source, signed_up_at signedUpAt FROM session_attendees WHERE session_id = 's1'`,
      )).toEqual([{ source: 'SIGNUP', signedUpAt: 1_800_000_000 }])
    })
  })

  test('somebody who withdrew and then turned up comes back, marked as a walk-in', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-one')
      run(database, signUpStatement('a1', 's1', 'u-one', 1_800_000_000))
      database.batch([boundStatement(database, withdrawStatement('s1', 'u-one'))])

      expect(run(database, walkInStatement('a2', 's1', 'u-one', 1_800_000_100))).toHaveLength(0)
      expect(run(database, walkInRejoinStatement('s1', 'u-one', 1_800_000_100))).toHaveLength(1)

      expect(rows<{ source: string, status: string }>(
        database, `SELECT source, status FROM session_attendees WHERE session_id = 's1'`,
      )).toEqual([{ source: 'WALK_IN', status: 'SIGNED_UP' }])
    })
  })

  test('a walk-in goes to the back, so nobody who signed up loses a place to the door', async () => {
    await withDatabase((database) => {
      seed(database, 1)
      member(database, 'u-one')
      member(database, 'u-two')
      run(database, signUpStatement('a1', 's1', 'u-one', 1_800_000_000))
      run(database, walkInStatement('a2', 's1', 'u-two', 1_800_000_000))

      const [text] = boundStatement(database, signUpOrderStatement('s1'))
      const order = database.raw.prepare(text).all('s1') as SignUpOrder[]
      const places = placesFrom(order, 1)

      expect(places.find(place => place.userId === 'u-one')?.placed).toBe(true)
      expect(places.find(place => place.userId === 'u-two')?.placed).toBe(false)
    })
  })
})
