import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { rolesList } from '#shared/utils/roles-list'
import { protectedGrantRefusal, strandingBy } from '#shared/utils/protected-role'
import { grantsClause, holderCountsStatement, protectedHoldersStatement, usableAccountWhere } from '#server/utils/roles-register'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The role register's predicates and its counts (A-131 criteria 1, 2 and 3). A grant is live or
// lapsed by its expiry read now, never by a flag anything has to sweep (0009).

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

const schema = filterQuerySchema(rolesList)

function query(raw: Record<string, string>, includeLapsed = false) {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return { ...result.data, includeLapsed }
}

function ids(database: TestDatabase, raw: Record<string, string>, includeLapsed = false): string[] {
  const clause = grantsClause(query(raw, includeLapsed), NOW)
  const statement = sql`SELECT role_grants.id AS id FROM role_grants
    JOIN users ON users.id = role_grants.user_id
    WHERE ${clause.where}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'ada', 'ada@example.test', 'Ada Admin', 1, 'hash'],
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'bea', 'bea@example.test', 'Bea Bar', 1, 'hash'],
    ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'cal', 'cal@example.test', 'Cal Committee', 1, 'hash'],
    ['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, ?, ?)', 'gone', 'gone@example.test', 'Erased', 1, NOW - 60],
    ['INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?)', 'g-ada', 'ada', 'ADMIN', null, 'ada', NOW - YEAR],
    ['INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?)', 'g-bea', 'bea', 'BAR_MANAGER', NOW + YEAR, 'ada', NOW - 60],
    ['INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?)', 'g-cal', 'cal', 'BAR_MANAGER', NOW - 60, 'ada', NOW - 2 * YEAR],
    ['INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?)', 'g-gone', 'gone', 'COMMITTEE', null, 'ada', NOW - YEAR],
  ])
}

describe('a role is what the register is read by (criterion 2)', () => {
  test('one role, not that role, and any of several', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { role: 'is:BAR_MANAGER' })).toEqual(['g-bea'])
      expect(ids(database, { role: 'is:ADMIN' })).toEqual(['g-ada'])
      expect(ids(database, { role: 'any:ADMIN,BAR_MANAGER' })).toEqual(['g-ada', 'g-bea'])
      expect(ids(database, { role: 'not:ADMIN' })).toEqual(['g-bea'])
    })
  })

  test('the holder is searched by name or address, never by the id nobody knows', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { search: 'Bea' })).toEqual(['g-bea'])
      expect(ids(database, { search: 'ada@example' })).toEqual(['g-ada'])
      expect(ids(database, { search: 'nobody at all' })).toEqual([])
    })
  })

  test('it sorts by the holder by default, and by expiry when asked', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { role: 'any:ADMIN,BAR_MANAGER' })).toEqual(['g-ada', 'g-bea'])
      // A permanent grant has no expiry at all, so it sorts ahead of every dated one.
      expect(ids(database, { sort: 'expiresAt', direction: 'asc', lapsed: 'true' })).toEqual(['g-cal'])
    })
  })
})

describe('a lapsed grant is hidden until it is asked for (criterion 3)', () => {
  test('the default register is live grants only', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { role: 'is:BAR_MANAGER' })).toEqual(['g-bea'])
      expect(ids(database, { role: 'is:BAR_MANAGER' }, true)).toEqual(['g-bea', 'g-cal'])
      expect(ids(database, { role: 'is:BAR_MANAGER', lapsed: 'true' })).toEqual(['g-cal'])
      expect(ids(database, { role: 'is:BAR_MANAGER', lapsed: 'false' })).toEqual(['g-bea'])
    })
  })

  test('what the hiding took out is counted, so hidden never means lost', async () => {
    await withDatabase((database) => {
      seed(database)
      const hidden = grantsClause(query({ role: 'is:BAR_MANAGER' }), NOW).hiddenLapsed
      expect(hidden).toBeDefined()
      const statement = sql`SELECT count(*) AS n FROM role_grants
        JOIN users ON users.id = role_grants.user_id WHERE ${hidden!}`
      const [text, ...parameters] = boundStatement(database, statement)
      expect(rows<{ n: number }>(database, text, ...parameters)[0]!.n).toBe(1)

      // Asked for, nothing is being hidden, so there is nothing to count.
      expect(grantsClause(query({ role: 'is:BAR_MANAGER' }, true), NOW).hiddenLapsed).toBeUndefined()
      expect(grantsClause(query({ lapsed: 'true' }), NOW).hiddenLapsed).toBeUndefined()
    })
  })

  test('a permanent grant is its own question, and is never lapsed', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { permanent: 'true' })).toEqual(['g-ada'])
      expect(ids(database, { permanent: 'false' })).toEqual(['g-bea'])
      expect(ids(database, { permanent: 'true', lapsed: 'true' })).toEqual([])
    })
  })
})

describe('an anonymised account is not a role holder (A-120 criterion 3)', () => {
  test('a tombstone is out of the register however it is asked for', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { role: 'is:COMMITTEE' })).toEqual([])
      expect(ids(database, { role: 'is:COMMITTEE' }, true)).toEqual([])
      expect(ids(database, { permanent: 'true' })).not.toContain('g-gone')
    })
  })
})

describe('every role is counted in one statement, never a query each (criterion 1, 0006)', () => {
  test('live holders per role, with the lapsed and the erased left out', async () => {
    await withDatabase((database) => {
      seed(database)
      const [text, ...parameters] = boundStatement(database, holderCountsStatement(NOW))
      const counted = rows<{ role: string, holders: number }>(database, text, ...parameters)
      const byRole = Object.fromEntries(counted.map(row => [row.role, Number(row.holders)]))

      expect(byRole.ADMIN).toBe(1)
      expect(byRole.BAR_MANAGER).toBe(1)
      expect(byRole.COMMITTEE).toBeUndefined()
    })
  })

  test('one statement, and its parameter count does not grow with the roles there are', async () => {
    await withDatabase((database) => {
      seed(database)
      const [text, ...parameters] = boundStatement(database, holderCountsStatement(NOW))
      expect(text.toLowerCase()).toContain('group by')
      expect(parameters.length).toBeLessThanOrEqual(2)
    })
  })
})

// A-120 criteria 1 and 3, issue #1355: the guard keeps a usable IT Manager whose grant cannot
// lapse, so what it reads is every usable holder with their expiry, and nobody else.
describe('the IT Manager the guard keeps is a usable one with a permanent grant', () => {
  function holders(database: TestDatabase): { userId: string, expiresAt: number | null }[] {
    const [text, ...parameters] = boundStatement(database, protectedHoldersStatement(NOW))
    return rows<{ userId: string, expiresAt: number | null }>(database, text, ...parameters)
      .sort((left, right) => left.userId.localeCompare(right.userId))
  }

  function usable(database: TestDatabase): string[] {
    const [text, ...parameters] = boundStatement(database, sql`SELECT id FROM users WHERE ${usableAccountWhere()}`)
    return rows<{ id: string }>(database, text, ...parameters).map(row => row.id).sort()
  }

  function seedHolders(database: TestDatabase): void {
    seed(database)
    database.batch([
      ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'dan', 'dan@example.test', 'Dan Dated', 1, 'hash'],
      ['INSERT INTO users (id, email, name, verified, password, disabled) VALUES (?, ?, ?, ?, ?, ?)', 'dis', 'dis@example.test', 'Dis Abled', 1, 'hash', 1],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, ?)', 'pen', 'pen@example.test', 'Pen Ding', 0],
      ['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, ?, ?)', 'old', 'old@example.test', 'Old Lapsed', 1, 'hash'],
      ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-dan', 'dan', 'ADMIN', NOW + YEAR],
      ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-dis', 'dis', 'ADMIN', null],
      ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-pen', 'pen', 'ADMIN', null],
      ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-old', 'old', 'ADMIN', NOW - 60],
    ])
  }

  test('disabled, waiting, lapsed and erased holders are not read at all', async () => {
    await withDatabase((database) => {
      seedHolders(database)
      expect(holders(database)).toEqual([
        { userId: 'ada', expiresAt: null },
        { userId: 'dan', expiresAt: NOW + YEAR },
      ])
      expect(usable(database)).toEqual(['ada', 'bea', 'cal', 'dan', 'old'])
    })
  })

  test('so a disabled permanent IT Manager does not let the usable one be dated or revoked', async () => {
    await withDatabase((database) => {
      seedHolders(database)
      expect(strandingBy(holders(database), 'ada')).toBe('dated')
      expect(strandingBy(holders(database), 'dan')).toBeNull()
      expect(protectedGrantRefusal(holders(database), { userId: 'ada', expiresAt: NOW + YEAR, usable: true })).not.toBeNull()
    })
  })
})
