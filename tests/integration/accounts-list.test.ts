import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { accountsList } from '#shared/utils/accounts-list'
import { filterQuerySchema, operatorsOf } from '#shared/utils/list-filters'
import { daysAfter, londonDay } from '#shared/utils/membership'
import { ROLES } from '#shared/utils/roles'
import { accountsClause } from '#server/utils/directory'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { AccountsContext } from '#server/utils/directory'
import type { FilterField } from '#shared/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The account directory through its declaration (K-129 criteria 1 and 5). A role is not a
// column and a membership is a dated state, so both are answered by the binding, not the table.

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
const YEAR = 365 * 24 * 60 * 60

const context: AccountsContext = { now: NOW, graceDays: 30, privilegedRoles: ['ADMIN'], retentionYears: 2 }

const schema = filterQuerySchema(accountsList)

function query(raw: Record<string, string>, includeAnonymised = false) {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return { ...result.data, includeAnonymised }
}

function ids(database: TestDatabase, raw: Record<string, string>, includeAnonymised = false): string[] {
  const clause = accountsClause(query(raw, includeAnonymised), context)
  const statement = sql`SELECT id FROM users WHERE ${clause.where} ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

function seed(database: TestDatabase): void {
  const today = londonDay(new Date())
  database.batch([
    ['INSERT INTO users (id, email, name, verified, password, last_login_at) VALUES (?, ?, ?, ?, ?, ?)', 'admin', 'admin@example.test', 'Ada Admin', 1, 'hash', NOW - 60],
    ['INSERT INTO users (id, email, name, verified, password, last_login_at) VALUES (?, ?, ?, ?, ?, ?)', 'treasurer', 'tre@example.test', 'Tom Treasurer', 1, 'hash', NOW - 60],
    ['INSERT INTO users (id, email, name, verified, password, last_login_at) VALUES (?, ?, ?, ?, ?, ?)', 'lapsed', 'lap@example.test', 'Lou Lapsed', 1, 'hash', NOW - 3 * YEAR],
    ['INSERT INTO users (id, email, name, verified, password, last_login_at) VALUES (?, ?, ?, ?, ?, ?)', 'member', 'mem@example.test', 'Mia Member', 1, 'hash', NOW - 60],
    ['INSERT INTO users (id, email, name, verified, password, last_login_at) VALUES (?, ?, ?, ?, ?, ?)', 'guest', 'guest@example.test', 'Gus Guest', 0, null, null],
    ['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, ?, ?)', 'gone', 'gone@example.test', 'Erased', 1, NOW - 60],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-admin', 'admin', 'ADMIN', null],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-tre', 'treasurer', 'TREASURER', NOW + YEAR],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-lapsed', 'lapsed', 'TREASURER', NOW - 60],
    ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)', 'm-member', 'member', today, daysAfter(today, 1), 'MANUAL'],
    ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)', 'm-lapsed', 'lapsed', '2020-01-01', '2021-01-01', 'MANUAL'],
    ['INSERT INTO totp_secrets (user_id, secret, confirmed_at) VALUES (?, ?, ?)', 'treasurer', 'secret', NOW - 60],
  ])
}

describe('a role is a filter though it is not a column (criterion 1)', () => {
  test('is, is not, is any of and holds no role, and a lapsed grant does not count (0009)', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { role: 'is:ADMIN' })).toEqual(['admin'])
      expect(ids(database, { role: 'is:TREASURER' })).toEqual(['treasurer'])
      expect(ids(database, { role: 'not:ADMIN' })).toEqual(['guest', 'lapsed', 'member', 'treasurer'])
      expect(ids(database, { role: 'any:ADMIN,TREASURER' })).toEqual(['admin', 'treasurer'])
      expect(ids(database, { holdsRole: 'false' })).toEqual(['guest', 'lapsed', 'member'])
      expect(ids(database, { holdsRole: 'true' })).toEqual(['admin', 'treasurer'])
      expect(ids(database, { holdsRole: 'true', role: 'not:ADMIN' })).toEqual(['treasurer'])
    })
  })

  test('the role list is capped at the number of roles there are, and one past it is refused', async () => {
    await withDatabase(() => {
      expect(schema.safeParse({ role: `any:${ROLES.join(',')}` }).success).toBe(true)
      expect(schema.safeParse({ role: `any:${[...ROLES, 'ADMIN'].join(',')}` }).success).toBe(false)
    })
  })
})

describe('a membership is a dated state read at query time (0009, 0031)', () => {
  test('current, lapsed and never', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { membership: 'is:current' })).toEqual(['member'])
      expect(ids(database, { membership: 'is:lapsed' })).toEqual(['lapsed'])
      expect(ids(database, { membership: 'is:none' })).toEqual(['admin', 'guest', 'treasurer'])
    })
  })
})

describe('the triage questions the directory is asked', () => {
  test('each derived yes or no answers from the rows, never a flag', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { authenticator: 'true' })).toEqual(['treasurer'])
      expect(ids(database, { privilegedWithoutFactor: 'true' })).toEqual(['admin'])
      expect(ids(database, { approachingRetention: 'true' })).toEqual(['lapsed'])
      expect(ids(database, { neverSignedIn: 'true' })).toEqual(['guest'])
      expect(ids(database, { verified: 'false' })).toEqual(['guest'])
    })
  })

  test('anonymised rows are hidden unless asked for, by the field or by the picker\'s flag', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, {})).not.toContain('gone')
      expect(ids(database, { anonymised: 'true' })).toEqual(['gone'])
      expect(ids(database, { anonymised: 'false' })).not.toContain('gone')
      expect(ids(database, { search: 'gone' }, true)).toEqual(['gone'])
    })
  })

  test('search covers the name, the address and the student number', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([['UPDATE users SET student_id = ? WHERE id = ?', 'S1234567', 'member']])
      expect(ids(database, { search: 'ada' })).toEqual(['admin'])
      expect(ids(database, { search: 'tre@' })).toEqual(['treasurer'])
      expect(ids(database, { search: 's1234' })).toEqual(['member'])
    })
  })
})

// A declared field the binding cannot answer would be a 500 on the first click; caught here.
describe('every field the declaration names is answered', () => {
  test('each field without a column has a binding, for every operator it offers', async () => {
    await withDatabase((database) => {
      seed(database)
      for (const field of accountsList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const value = field.kind === 'yes-no' ? 'true' : (field.options?.[0]?.value ?? '2026-01-01')
          const raw = operator === 'empty' ? 'empty' : operator === 'between' ? `between:${value},${value}` : `${operator}:${value}`
          expect(() => ids(database, { [field.key]: raw })).not.toThrow()
        }
      }
    })
  })
})

describe('the statement is bounded by the declaration (criterion 5, 0006)', () => {
  test('a full role list binds as many parameters as there are roles, and nothing per account', async () => {
    await withDatabase((database) => {
      seed(database)
      const clause = accountsClause(query({ role: `any:${ROLES.join(',')}`, search: 'a' }), context)
      const [text, ...parameters] = boundStatement(database, clause.where!)
      expect(parameters.filter(one => (ROLES as readonly string[]).includes(String(one)))).toHaveLength(ROLES.length)
      expect(text).not.toMatch(/users\.id IN \(/i)
    })
  })

  test('sorting is by a declared field only', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(schema.safeParse({ sort: 'email' }).success).toBe(false)
      expect(ids(database, { sort: 'lastLoginAt', direction: 'desc' })[0]).not.toBe('lapsed')
    })
  })
})
