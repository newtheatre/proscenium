import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import { accessProfilesClause } from '#server/utils/access-profiles'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ListClause } from '#server/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// K-129, D-127: the accessibility officer's queue reads through its own declaration, pending
// hidden as the default the way the register hides "current" (issue 923).

const schema = filterQuerySchema(accessProfilesList)
function parsed(raw: Record<string, string>): ListClause {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return accessProfilesClause(result.data)
}

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
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-amy', 'amy@example.test', 'Amy Ash'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-ben', 'ben@example.test', 'Ben Birch'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-cat', 'cat@example.test', 'Cat Cedar'],
    ['INSERT INTO access_profiles (user_id, status, created_at) VALUES (?, ?, ?)', 'u-amy', 'PENDING', 100],
    ['INSERT INTO access_profiles (user_id, status, created_at) VALUES (?, ?, ?)', 'u-ben', 'VERIFIED', 200],
    ['INSERT INTO access_profiles (user_id, status, created_at) VALUES (?, ?, ?)', 'u-cat', 'DECLINED', 300],
  ])
}

// Every case runs the clause's own predicate against the real join, never a copy of it.
function userIds(database: TestDatabase, clause: ListClause): string[] {
  const base = 'SELECT access_profiles.user_id AS value FROM access_profiles JOIN users ON users.id = access_profiles.user_id'
  if (!clause.where) return rows<{ value: string }>(database, base).map(row => row.value)
  const [text, ...values] = boundStatement(database, clause.where)
  return rows<{ value: string }>(database, `${base} WHERE ${text}`, ...values).map(row => row.value)
}

describe('the officer queue hides pending as its default, the register\'s own shape', () => {
  test('no status asked shows pending only', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(userIds(database, parsed({}))).toEqual(['u-amy'])
    })
  })

  test('status:is:ALL includes every declaration', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(userIds(database, parsed({ status: 'is:ALL' })).sort()).toEqual(['u-amy', 'u-ben', 'u-cat'])
    })
  })

  test('a specific status filters on it, not the hidden default', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(userIds(database, parsed({ status: 'is:VERIFIED' }))).toEqual(['u-ben'])
    })
  })

  test('search runs over the patron\'s name and email, not the encrypted payload', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(userIds(database, parsed({ status: 'is:ALL', search: 'birch' }))).toEqual(['u-ben'])
    })
  })
})
