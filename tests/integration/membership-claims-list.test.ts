import { describe, expect, test } from 'bun:test'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { tableColumns, whereFrom } from '#server/utils/list-filters'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { Reference } from '#server/utils/list-filters'

// The claims queue through its declaration (K-129, A-130): search, sort and page, nothing else.

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

function claim(database: TestDatabase, id: string, userId: string, studentId: string, status: string, createdAt: number): void {
  database.batch([[
    'INSERT INTO membership_claims (id, user_id, student_id, starts_on, term, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, userId, studentId, '2026-09-01', 1, status, createdAt,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(membershipClaimsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

// `rowid` is insertion order and not a Drizzle column; the listing joins `users`, which has one too.
function claimsColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.membershipClaims}.rowid`
  return tableColumns(schema.membershipClaims)(name)
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = whereFrom(membershipClaimsList, parsed(query), {
    column: claimsColumn,
    search: [schema.users.name, schema.users.email, schema.membershipClaims.studentId],
  })
  const where = and(eq(schema.membershipClaims.status, 'OPEN'), isNull(schema.users.anonymisedAt), clause.where)
  const statement = sql`SELECT membership_claims.id AS id FROM membership_claims
    JOIN users ON users.id = membership_claims.user_id
    ${where ? sql`WHERE ${where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the queue has no declared filter, only search, sort and page', () => {
  test('search reaches the name, the address and the student number', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'Ivy Ivory')
      person(database, 'u-2', 'Bea Birch')
      claim(database, 'c-1', 'u-1', 'S1000001', 'OPEN', 1_780_000_000)
      claim(database, 'c-2', 'u-2', 'S1000002', 'OPEN', 1_780_000_100)

      expect(ids(database, { search: 'ivy' })).toEqual(['c-1'])
      expect(ids(database, { search: 'S1000002' })).toEqual(['c-2'])
    })
  })

  test('the default sort is oldest first, and a same-second tie breaks on recorded order', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'One')
      person(database, 'u-2', 'Two')
      claim(database, 'c-1', 'u-1', 'S1000001', 'OPEN', 1_780_000_000)
      claim(database, 'c-2', 'u-2', 'S1000002', 'OPEN', 1_780_000_000)

      expect(ids(database, {})).toEqual(['c-1', 'c-2'])
    })
  })

  test('a column that is not declared cannot be sorted by', () => {
    expect(filterQuerySchema(membershipClaimsList).safeParse({ sort: 'studentId' }).success).toBe(false)
  })
})
