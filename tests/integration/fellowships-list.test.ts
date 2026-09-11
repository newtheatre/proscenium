import { describe, expect, test } from 'bun:test'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { fellowshipsList } from '#shared/utils/fellowships-list'
import { tableColumns, whereFrom } from '#server/utils/list-filters'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The roll of Fellows through its declaration (K-129, A-127). "Current" is the hidden default
// when nothing is asked, the same shape the accounts directory gives anonymised rows.

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

function fellowship(database: TestDatabase, id: string, userId: string, citation: string, revokedAt: number | null): void {
  database.batch([[
    'INSERT INTO fellowships (id, user_id, awarded_on, awarded_by, citation, revoked_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, userId, '2020-06-12', 'Committee, 12 June 2020', citation, revokedAt,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(fellowshipsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const input = parsed(query)
  const clause = whereFrom(fellowshipsList, input, {
    column: tableColumns(schema.fellowships),
    search: [schema.users.name, schema.users.email, schema.fellowships.citation],
    fields: {
      show: (condition) => {
        if (condition.values[0] === 'revoked') return isNotNull(schema.fellowships.revokedAt)
        if (condition.values[0] === 'everyone') return undefined
        return isNull(schema.fellowships.revokedAt)
      },
    },
  })
  const asked = conditionsOf(fellowshipsList, input).some(condition => condition.key === 'show')
  const where = asked ? clause.where : and(isNull(schema.fellowships.revokedAt), clause.where)

  const statement = sql`SELECT fellowships.id AS id FROM fellowships
    JOIN users ON users.id = fellowships.user_id
    ${where ? sql`WHERE ${where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the roll defaults to current, and show narrows it to revoked or everyone', () => {
  test('an unset filter and an explicit "is current" agree, and exclude a revoked award', async () => {
    await withDatabase((database) => {
      person(database, 'u-live', 'Live Fellow')
      person(database, 'u-revoked', 'Revoked Fellow')
      fellowship(database, 'f-live', 'u-live', 'For service', null)
      fellowship(database, 'f-revoked', 'u-revoked', 'For service', 1_780_000_000)

      expect(ids(database, {})).toEqual(['f-live'])
      expect(ids(database, { show: 'is:current' })).toEqual(['f-live'])
      expect(ids(database, { show: 'revoked' })).toEqual(['f-revoked'])
      expect(ids(database, { show: 'everyone' }).sort()).toEqual(['f-live', 'f-revoked'].sort())
    })
  })

  test('search reaches the name, the address and the citation', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'Ivy Ivory')
      fellowship(database, 'f-1', 'u-1', 'For twenty years of front of house', null)
      expect(ids(database, { search: 'ivy' })).toEqual(['f-1'])
      expect(ids(database, { search: 'front of house' })).toEqual(['f-1'])
    })
  })
})

describe('a show outside a single choice is refused, and sorting is by a declared field only', () => {
  test('"any" is refused for show, because nothing offered more than one choice before', () => {
    expect(filterQuerySchema(fellowshipsList).safeParse({ show: 'any:current,revoked' }).success).toBe(false)
  })

  test('the default sort is by the date awarded', async () => {
    await withDatabase((database) => {
      person(database, 'u-1', 'One')
      person(database, 'u-2', 'Two')
      fellowship(database, 'f-1', 'u-1', 'Later', null)
      fellowship(database, 'f-2', 'u-2', 'Earlier', null)
      database.batch([['UPDATE fellowships SET awarded_on = ? WHERE id = ?', '2019-01-01', 'f-2']])
      expect(ids(database, {})).toEqual(['f-2', 'f-1'])
    })
  })

  test('a column that is not declared cannot be sorted by', () => {
    expect(filterQuerySchema(fellowshipsList).safeParse({ sort: 'citation' }).success).toBe(false)
  })
})
