import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { daysAfter, londonDay } from '#shared/utils/membership'
import { membershipsList } from '#shared/utils/memberships-list'
import { membershipsClause } from '#server/utils/membership'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The register through its declaration (K-129, A-117, A-130). "Awaiting record" is a declared
// option so the runbook link keeps parsing, but is never answered by this predicate: the queue
// is a different table, reached through a different endpoint the page chooses instead.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const GRACE = 30
const TODAY = londonDay(new Date())

function person(database: TestDatabase, id: string, name: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, `${id}@example.invalid`, name]])
}

function membership(database: TestDatabase, id: string, userId: string, startsOn: string, expiresOn: string, confirmed: boolean): void {
  database.batch([[
    'INSERT INTO memberships (id, user_id, starts_on, expires_on, source, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, userId, startsOn, expiresOn, 'MANUAL', confirmed ? 1_780_000_000 : null,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(membershipsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = membershipsClause(parsed(query), GRACE)
  const statement = sql`SELECT memberships.id AS id FROM memberships
    JOIN users ON users.id = memberships.user_id
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the register defaults to current, the same hidden default an unset filter gives', () => {
  test('an unset filter and an explicit "is current" agree', async () => {
    await withDatabase((database) => {
      person(database, 'u-current', 'Cara Current')
      person(database, 'u-lapsed', 'Lou Lapsed')
      membership(database, 'm-current', 'u-current', daysAfter(TODAY, -30), daysAfter(TODAY, 30), true)
      membership(database, 'm-lapsed', 'u-lapsed', daysAfter(TODAY, -400), daysAfter(TODAY, -40), true)

      expect(ids(database, {})).toEqual(['m-current'])
      expect(ids(database, { filter: 'is:current' })).toEqual(['m-current'])
      expect(ids(database, { filter: 'lapsed' })).toEqual(['m-lapsed'])
      expect(ids(database, { filter: 'everyone' }).sort()).toEqual(['m-current', 'm-lapsed'])
    })
  })

  test('awaiting a check is unconfirmed and still in term', async () => {
    await withDatabase((database) => {
      person(database, 'u-checked', 'Ada Checked')
      person(database, 'u-waiting', 'Wes Waiting')
      membership(database, 'm-checked', 'u-checked', daysAfter(TODAY, -30), daysAfter(TODAY, 30), true)
      membership(database, 'm-waiting', 'u-waiting', daysAfter(TODAY, -30), daysAfter(TODAY, 30), false)

      expect(ids(database, { filter: 'awaiting-check' })).toEqual(['m-waiting'])
    })
  })

  test('awaiting record is a declared option, so a bare link still parses, though nothing here answers it', () => {
    const parsedQuery = filterQuerySchema(membershipsList).safeParse({ filter: 'awaiting-record' })
    expect(parsedQuery.success).toBe(true)
    if (parsedQuery.success) expect(conditionsOf(membershipsList, parsedQuery.data)).toEqual([{ key: 'filter', operator: 'is', values: ['awaiting-record'] }])
    expect(() => membershipsClause(parsedQuery.success ? parsedQuery.data : parsed({}), GRACE)).toThrow(/register filter/)
  })

  test('search reaches the name and the address', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'Ivy Ivory')
      membership(database, 'm-1', 'u-1', daysAfter(TODAY, -30), daysAfter(TODAY, 30), true)
      expect(ids(database, { filter: 'everyone', search: 'ivy' })).toEqual(['m-1'])
    })
  })
})

describe('sorting is by a declared field only', () => {
  test('the default is by when the term runs out, latest first', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'One')
      person(database, 'u-2', 'Two')
      membership(database, 'm-1', 'u-1', daysAfter(TODAY, -900), daysAfter(TODAY, 20), true)
      membership(database, 'm-2', 'u-2', daysAfter(TODAY, -900), daysAfter(TODAY, 40), true)
      expect(ids(database, { filter: 'everyone' })).toEqual(['m-2', 'm-1'])
    })
  })

  test('a column that is not declared cannot be sorted by', () => {
    expect(filterQuerySchema(membershipsList).safeParse({ sort: 'source' }).success).toBe(false)
  })
})
