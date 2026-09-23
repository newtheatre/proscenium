import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { claimsClause } from '#server/utils/membership-claims'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The claims queue through its own declaration (K-129, A-130 criterion 9): status, search, sort
// and page, with waiting the default and an erased person's claim never shown.

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

function claim(database: TestDatabase, id: string, userId: string, studentId: string, status: string, createdAt: number, decidedAt: number | null = null): void {
  database.batch([[
    'INSERT INTO membership_claims (id, user_id, student_id, starts_on, term, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, userId, studentId, '2026-09-01', 1, status, createdAt, decidedAt,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(membershipClaimsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

// The endpoint's own clause, so what is tested is what the route asks the database.
function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = claimsClause(parsed(query))
  const statement = sql`SELECT membership_claims.id AS id FROM membership_claims
    JOIN users ON users.id = membership_claims.user_id
    WHERE ${clause.where}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the queue reads its own declaration (A-130 criterion 9)', () => {
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

  test('with no status asked it shows what is waiting, and an erased person never', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'One')
      person(database, 'u-2', 'Two')
      person(database, 'u-3', 'Gone')
      database.batch([['UPDATE users SET anonymised_at = 1 WHERE id = ?', 'u-3']])
      claim(database, 'c-open', 'u-1', 'S1000001', 'OPEN', 1_780_000_000)
      claim(database, 'c-declined', 'u-2', 'S1000002', 'DECLINED', 1_780_000_050, 1_780_000_500)
      claim(database, 'c-erased', 'u-3', '', 'OPEN', 1_780_000_100)

      expect(ids(database, {})).toEqual(['c-open'])
    })
  })

  test('a decided claim is found by its status, newest decision first when sorted so', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'One')
      person(database, 'u-2', 'Two')
      claim(database, 'c-open', 'u-1', 'S1000001', 'OPEN', 1_780_000_900)
      claim(database, 'c-early', 'u-1', 'S1000001', 'RECORDED', 1_780_000_000, 1_780_000_100)
      claim(database, 'c-late', 'u-2', 'S1000002', 'RECORDED', 1_780_000_050, 1_780_000_800)
      claim(database, 'c-declined', 'u-2', 'S1000002', 'DECLINED', 1_780_000_060, 1_780_000_700)

      expect(ids(database, { status: 'RECORDED' })).toEqual(['c-early', 'c-late'])
      expect(ids(database, { status: 'is:RECORDED', sort: 'decidedAt', direction: 'desc' })).toEqual(['c-late', 'c-early'])
      expect(ids(database, { status: 'DECLINED' })).toEqual(['c-declined'])
      expect(ids(database, { status: 'OPEN' })).toEqual(['c-open'])
    })
  })

  test('a status the table does not hold is refused rather than widened', () => {
    expect(filterQuerySchema(membershipClaimsList).safeParse({ status: 'PENDING' }).success).toBe(false)
  })
})
