import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { constraintRefusal } from '#shared/utils/constraint-refusal'
import { protectedGrantRefusal, strandingBy } from '#shared/utils/protected-role'
import { IT_MANAGER_ASSERTION, grantKeepsAnItManagerWhere, itManagerAssertion, keepsAnItManagerWhere, protectedHoldersStatement } from '#server/utils/roles-register'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { race } from '#tests/helpers/race'
import type { SQL } from 'drizzle-orm'
import type { ProtectedHolder } from '#shared/utils/protected-role'
import type { TestDatabase } from '#tests/helpers/database'

// A-120 criterion 5 and issue #1355: the last-IT-Manager guard rides the write it blocks, so two
// officers acting at once cannot each pass a check the other's write then makes false.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const NOW = Math.floor(Date.now() / 1000)
const LATER = NOW + 365 * 24 * 60 * 60

function account(database: TestDatabase, id: string, options: { disabled?: boolean, waiting?: boolean } = {}): void {
  database.batch([[
    'INSERT INTO users (id, email, name, verified, password, disabled) VALUES (?, ?, ?, 1, ?, ?)',
    id, `${id}@example.test`, `Person ${id}`, options.waiting ? null : 'hash', options.disabled ? 1 : 0,
  ]])
}

function itManager(database: TestDatabase, id: string, expiresAt: number | null, options: { disabled?: boolean, waiting?: boolean } = {}): void {
  account(database, id, options)
  database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', `g-${id}`, id, 'ADMIN', expiresAt]])
}

function holders(database: TestDatabase): ProtectedHolder[] {
  const [text, ...parameters] = boundStatement(database, protectedHoldersStatement(NOW))
  return rows<ProtectedHolder>(database, text, ...parameters)
}

function holds(database: TestDatabase, predicate: SQL): boolean {
  const [text, ...parameters] = boundStatement(database, sql`select (${predicate}) as holds`)
  return Boolean(rows<{ holds: number }>(database, text, ...parameters)[0]!.holds)
}

// The route's shape: the assertion first, then the write, in one batch; a refusal writes nothing.
function attempt(database: TestDatabase, guard: SQL, ...writes: SQL[]): number {
  try {
    database.batch([guard, ...writes].map(statement => boundStatement(database, statement)))
    return 200
  }
  catch (error) {
    return constraintRefusal([{ violated: IT_MANAGER_ASSERTION, says: 'refused' }], error)?.statusCode ?? 500
  }
}

const revoke = (userId: string): SQL => sql`delete from role_grants where user_id = ${userId} and role = 'ADMIN'`
const disable = (userId: string): SQL => sql`update users set disabled = 1 where id = ${userId}`
const date = (userId: string): SQL => sql`update role_grants set expires_at = ${LATER} where user_id = ${userId} and role = 'ADMIN'`
const trail = (id: string): SQL => sql`insert into audit_log (id, action, target) values (${id}, 'role.revoked', 'user:x')`

describe('the statement\'s predicate is the rule the code reads', () => {
  test('for removing an IT Manager, whoever they are, it agrees with strandingBy', async () => {
    await withDatabase((database) => {
      itManager(database, 'ada', null)
      itManager(database, 'dan', LATER)
      itManager(database, 'dis', null, { disabled: true })
      itManager(database, 'pen', null, { waiting: true })
      itManager(database, 'old', NOW - 60)
      account(database, 'cal')
      for (const userId of ['ada', 'dan', 'dis', 'pen', 'old', 'cal']) {
        expect(`${userId}: ${holds(database, keepsAnItManagerWhere(userId, NOW))}`)
          .toBe(`${userId}: ${strandingBy(holders(database), userId) === null}`)
      }
    })
  })

  test('with every grant dated, no holder may go, and a non-holder always may', async () => {
    await withDatabase((database) => {
      itManager(database, 'ada', LATER)
      itManager(database, 'dan', LATER)
      account(database, 'cal')
      expect(holds(database, keepsAnItManagerWhere('ada', NOW))).toBe(false)
      expect(holds(database, keepsAnItManagerWhere('cal', NOW))).toBe(true)
    })
  })

  test('for granting the role, it agrees with protectedGrantRefusal', async () => {
    await withDatabase((database) => {
      itManager(database, 'ada', null)
      itManager(database, 'dan', LATER)
      account(database, 'cal')
      account(database, 'pen', { waiting: true })
      const cases = [
        { userId: 'ada', expiresAt: LATER, usable: true },
        { userId: 'ada', expiresAt: null, usable: true },
        { userId: 'dan', expiresAt: LATER, usable: true },
        { userId: 'cal', expiresAt: LATER, usable: true },
        { userId: 'pen', expiresAt: null, usable: false },
        { userId: null, expiresAt: LATER, usable: false },
      ]
      for (const grant of cases) {
        expect(`${grant.userId}/${grant.expiresAt}: ${holds(database, grantKeepsAnItManagerWhere(grant, NOW))}`)
          .toBe(`${grant.userId}/${grant.expiresAt}: ${protectedGrantRefusal(holders(database), grant) === null}`)
      }
      database.batch([['UPDATE role_grants SET expires_at = ? WHERE user_id = ?', LATER, 'ada']])
      expect(holds(database, grantKeepsAnItManagerWhere({ userId: 'pen', expiresAt: null }, NOW))).toBe(false)
      expect(holds(database, grantKeepsAnItManagerWhere({ userId: 'cal', expiresAt: null }, NOW))).toBe(true)
    })
  })
})

describe('two officers acting at once leave a permanent IT Manager (criterion 5)', () => {
  test('both revokes pass the check on one snapshot, and the statement refuses the second', async () => {
    await withDatabase(async (database) => {
      itManager(database, 'ada', null)
      itManager(database, 'bea', null)
      const snapshot = holders(database)
      expect([strandingBy(snapshot, 'ada'), strandingBy(snapshot, 'bea')]).toEqual([null, null])

      const answers = await race(2, async index => attempt(database, itManagerAssertion(keepsAnItManagerWhere(['ada', 'bea'][index]!, NOW)), revoke(['ada', 'bea'][index]!), trail(`a-${index}`)))
      expect(answers.sort()).toEqual([200, 409])
      expect(rows(database, `SELECT user_id FROM role_grants WHERE role = 'ADMIN' AND expires_at IS NULL`)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  test('dating both permanent grants at once dates one', async () => {
    await withDatabase(async (database) => {
      itManager(database, 'ada', null)
      itManager(database, 'bea', null)
      const answers = await race(2, async index => attempt(database, itManagerAssertion(grantKeepsAnItManagerWhere({ userId: ['ada', 'bea'][index]!, expiresAt: LATER }, NOW)), date(['ada', 'bea'][index]!)))
      expect(answers.sort()).toEqual([200, 409])
      expect(rows(database, `SELECT user_id FROM role_grants WHERE role = 'ADMIN' AND expires_at IS NULL`)).toHaveLength(1)
    })
  })

  test('a revoke and a disable of the other at once leave one usable permanent IT Manager', async () => {
    await withDatabase(async (database) => {
      itManager(database, 'ada', null)
      itManager(database, 'bea', null)
      const answers = await race(2, async index => index === 0
        ? attempt(database, itManagerAssertion(keepsAnItManagerWhere('ada', NOW)), revoke('ada'))
        : attempt(database, itManagerAssertion(keepsAnItManagerWhere('bea', NOW)), disable('bea')))
      expect(answers.sort()).toEqual([200, 409])
      expect(holders(database).filter(holder => holder.expiresAt === null)).toHaveLength(1)
    })
  })

  test('the assertion writes nothing while the guard holds', async () => {
    await withDatabase((database) => {
      itManager(database, 'ada', null)
      itManager(database, 'dan', LATER)
      expect(attempt(database, itManagerAssertion(keepsAnItManagerWhere('dan', NOW)), revoke('dan'))).toBe(200)
      expect(rows(database, 'SELECT user_id FROM role_grants')).toEqual([{ user_id: 'ada' }])
    })
  })
})
