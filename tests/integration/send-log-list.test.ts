import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { sendLogList } from '#shared/utils/send-log-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { sendLogClause } from '#server/utils/notification-log'
import type { TestDatabase } from '#tests/helpers/database'

// The send log through its declaration (K-129, H-106). Topic is not a column, and widens to the
// message types the catalogue names under it.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function sent(database: TestDatabase, id: string, type: string, channel: string, status: string, createdAt: number): void {
  database.batch([[
    'INSERT INTO notification_log (id, type, channel, status, created_at) VALUES (?, ?, ?, ?, ?)',
    id, type, channel, status, createdAt,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(sendLogList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = sendLogClause(parsed(query))
  const statement = sql`SELECT l.id AS id FROM notification_log l
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('a topic widens to the message types it covers, though it is not a column', () => {
  test('topic, channel and outcome each narrow the log', async () => {
    await withDatabase((database) => {
      sent(database, 'n-shift', 'shift.reminder', 'EMAIL', 'SENT', 1_780_000_000)
      sent(database, 'n-verify', 'account.verify', 'EMAIL', 'FAILED', 1_780_000_100)

      expect(ids(database, { topic: 'SHIFTS' })).toEqual(['n-shift'])
      expect(ids(database, { topic: 'BOOKINGS' })).toEqual([])
      expect(ids(database, { channel: 'EMAIL' })).toEqual(['n-verify', 'n-shift'])
      expect(ids(database, { status: 'FAILED' })).toEqual(['n-verify'])
    })
  })

  test('search reaches the type, case-insensitively and as a substring', async () => {
    await withDatabase((database) => {
      sent(database, 'n-shift', 'shift.reminder', 'EMAIL', 'SENT', 1_780_000_000)
      sent(database, 'n-verify', 'account.verify', 'EMAIL', 'SENT', 1_780_000_100)

      expect(ids(database, { search: 'SHIFT' })).toEqual(['n-shift'])
      expect(ids(database, { search: 'verify' })).toEqual(['n-verify'])
    })
  })
})

describe('a channel or outcome list is capped, and no statement grows with the data (0006)', () => {
  test('an "is any of" list binds exactly the values given', async () => {
    await withDatabase((database) => {
      const clause = sendLogClause(parsed({ channel: 'any:EMAIL,INBOX' }))
      const [, ...parameters] = boundStatement(database, clause.where!)
      expect(parameters).toEqual(['EMAIL', 'INBOX'])
    })
  })

  test('a topic outside a single choice is refused by the schema', () => {
    expect(filterQuerySchema(sendLogList).safeParse({ topic: 'any:SHIFTS,BOOKINGS' }).success).toBe(false)
  })
})

describe('sorting is by a declared field only', () => {
  test('the default is newest first', async () => {
    await withDatabase((database) => {
      sent(database, 'n-old', 'shift.reminder', 'EMAIL', 'SENT', 1_780_000_000)
      sent(database, 'n-new', 'shift.reminder', 'EMAIL', 'SENT', 1_780_000_100)
      expect(ids(database, {})).toEqual(['n-new', 'n-old'])
    })
  })

  test('a column that is not declared cannot be sorted by', () => {
    expect(filterQuerySchema(sendLogList).safeParse({ sort: 'error' }).success).toBe(false)
  })
})
