import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { auditList } from '#shared/utils/audit-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { auditClause } from '#server/utils/audit-search'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The audit trail through its declaration (K-129, J-103). Module is not a column, and widens to
// the actions it covers; actor and action are real columns answered generically.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, id: string, name: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, `${id}@example.invalid`, name]])
}

function entry(database: TestDatabase, id: string, actorId: string | null, action: string, target: string | null, createdAt: number): void {
  database.batch([[
    'INSERT INTO audit_log (id, actor_id, action, target, created_at) VALUES (?, ?, ?, ?, ?)',
    id, actorId, action, target, createdAt,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(auditList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = auditClause(parsed(query))
  const statement = sql`SELECT audit_log.id AS id FROM audit_log
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

const DAY = 24 * 60 * 60

describe('a module widens to the actions it covers, though it is not a column', () => {
  test('module, action and actor each narrow the trail', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1', 'Officer One')
      person(database, 'member-1', 'Member One')
      entry(database, 'e-grant', 'officer-1', 'role.granted', 'user:member-1', 1_780_000_000)
      entry(database, 'e-revoke', 'officer-1', 'role.revoked', 'user:member-1', 1_780_000_100)
      entry(database, 'e-erase', null, 'account.erased.system', 'user:member-1', 1_780_000_200)

      expect(ids(database, { module: 'identity' })).toEqual(['e-erase', 'e-revoke', 'e-grant'])
      expect(ids(database, { module: 'governance' })).toEqual([])
      expect(ids(database, { action: 'role.granted' })).toEqual(['e-grant'])
      expect(ids(database, { actor: 'officer-1' })).toEqual(['e-revoke', 'e-grant'])
      // An automatic entry has no actor: "is empty" is how the trail finds a system row.
      expect(ids(database, { actor: 'empty' })).toEqual(['e-erase'])
    })
  })

  test('search runs over the target, and a recorded window bounds by day', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1', 'Officer One')
      entry(database, 'e-old', 'officer-1', 'role.granted', 'user:aaa', 1_780_000_000)
      entry(database, 'e-new', 'officer-1', 'role.granted', 'user:bbb', 1_780_000_000 + 10 * DAY)

      expect(ids(database, { search: 'aaa' })).toEqual(['e-old'])
      const cutoff = new Date((1_780_000_000 + 5 * DAY) * 1000).toISOString().slice(0, 10)
      expect(ids(database, { createdAt: `after:${cutoff}` })).toEqual(['e-new'])
      expect(ids(database, { createdAt: `before:${cutoff}` })).toEqual(['e-old'])
    })
  })
})

describe('an actor list is capped, and no statement grows with the data (criterion 5, 0006)', () => {
  test('an actor "is any of" binds exactly the values given', async () => {
    await withDatabase((database) => {
      const clause = auditClause(parsed({ actor: 'any:a,b,c' }))
      const [, ...parameters] = boundStatement(database, clause.where!)
      expect(parameters.filter(one => ['a', 'b', 'c'].includes(String(one)))).toHaveLength(3)
    })
  })

  test('a module or an action outside a single choice is refused by the schema', () => {
    expect(filterQuerySchema(auditList).safeParse({ module: 'any:identity,bar' }).success).toBe(false)
    expect(filterQuerySchema(auditList).safeParse({ action: 'not:role.granted' }).success).toBe(false)
  })
})

describe('sorting is by a declared field, and a same-second tie breaks on recorded order', () => {
  test('the default is newest first, and a tie breaks on rowid rather than the random id', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1', 'Officer One')
      entry(database, 'e-1', 'officer-1', 'role.granted', 'user:aaa', 1_780_000_000)
      entry(database, 'e-2', 'officer-1', 'role.granted', 'user:bbb', 1_780_000_000)

      expect(ids(database, {})).toEqual(['e-1', 'e-2'])
      expect(ids(database, { sort: 'createdAt', direction: 'asc' })).toEqual(['e-1', 'e-2'])
    })
  })

  test('a column that is not declared cannot be sorted by', () => {
    expect(filterQuerySchema(auditList).safeParse({ sort: 'detail' }).success).toBe(false)
  })
})
