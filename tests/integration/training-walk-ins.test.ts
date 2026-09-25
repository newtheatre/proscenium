import { describe, expect, test } from 'bun:test'
import { placesFrom, signUpOrderStatement, signUpStatement, walkInRejoinStatement, walkInStatement, withdrawStatement } from '#shared/utils/training-signup'
import type { SignUpOrder } from '#shared/utils/training-signup'
import { auditEntry } from '#shared/utils/audit'
import { preLinkStatement } from '#shared/utils/google-prelink'
import { pendingGrantConstraintRefusal } from '#shared/utils/pending-grants'
import { walkInAccountStatements } from '#shared/utils/pending-records'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { expectOneWinner, race } from '#tests/helpers/race'
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

// What the lookup runs once its own checks have passed: the batch, then reading back whether the
// account was written, since a predicate that refused raises nothing (0003).
function mint(database: TestDatabase, index: number, email: string): { status: number, id?: string } {
  const id = `walk-in-${index}`
  const created = auditEntry({ actorId: 'u-trainer', action: 'account.created.console', target: `user:${id}` })
  try {
    database.batch(walkInAccountStatements(id, email, email, created).map(statement => boundStatement(database, statement)))
  }
  catch (error) {
    if (!pendingGrantConstraintRefusal(error)) return { status: 500 }
    // Losing the unique address means somebody else made it: answer with theirs (criterion 10).
    const [held] = rows<{ id: string }>(database, 'SELECT id FROM users WHERE email = ? AND anonymised_at IS NULL', email)
    return held ? { status: 200, id: held.id } : { status: 409 }
  }
  return rows(database, 'SELECT id FROM users WHERE id = ?', id).length ? { status: 200, id } : { status: 409 }
}

// Pre-link the address to another member's account, as A-104 criterion 6's route writes it.
function preLink(database: TestDatabase, email: string): { status: number } {
  database.batch([boundStatement(database, preLinkStatement('u-jo', email))])
  const [row] = rows<{ pending: string | null }>(database, `SELECT pending_google_email AS pending FROM users WHERE id = 'u-jo'`)
  return { status: row?.pending === email ? 200 : 409 }
}

describe('a walk-in by address mints a shadow account only while nobody is pre-linked to it (criteria 2 and 9)', () => {
  const WORKSPACE = 'walk.in@newtheatre.org.uk'

  test('a fresh address makes the account and its creation entry', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(mint(database, 0, 'fresher@example.test').status).toBe(200)
      expect(rows(database, `SELECT email, name, password FROM users WHERE id = 'walk-in-0'`))
        .toEqual([{ email: 'fresher@example.test', name: 'fresher@example.test', password: null }])
      expect(rows(database, `SELECT action FROM audit_log WHERE target = 'user:walk-in-0'`))
        .toEqual([{ action: 'account.created.console' }])
    })
  })

  test('a pre-link landing after the check and before the write leaves no account and no entry', async () => {
    await withDatabase((database) => {
      seed(database)
      member(database, 'u-jo')
      // The route's up-front check has already found nobody; the pre-link lands only now.
      expect(preLink(database, WORKSPACE).status).toBe(200)
      expect(mint(database, 0, WORKSPACE).status).toBe(409)
      expect(rows(database, 'SELECT id FROM users WHERE email = ?', WORKSPACE)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM audit_log WHERE target = 'user:walk-in-0'`)).toHaveLength(0)
    })
  })

  test('two walk-ins racing for one new address both answer with the one account made (criterion 10)', async () => {
    await withDatabase(async (database) => {
      seed(database)
      const answers = await race(2, async index => mint(database, index, 'twice@example.test'))
      expect(answers.map(answer => answer.status)).toEqual([200, 200])
      const made = rows<{ id: string }>(database, 'SELECT id FROM users WHERE email = ?', 'twice@example.test')
      expect(made).toHaveLength(1)
      expect(answers.map(answer => answer.id)).toEqual([made[0]!.id, made[0]!.id])
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'account.created.console'`)).toHaveLength(1)
    })
  })

  test('a pre-link and a walk-in racing for one address leave it leading to one account', async () => {
    await withDatabase(async (database) => {
      seed(database)
      member(database, 'u-jo')
      const answers = await race(2, async index => index === 0 ? preLink(database, WORKSPACE) : mint(database, 1, WORKSPACE))
      expectOneWinner(answers)
      expect(rows(database, 'SELECT id FROM users WHERE email = ? OR pending_google_email = ?', WORKSPACE, WORKSPACE)).toHaveLength(1)
    })
  })
})
