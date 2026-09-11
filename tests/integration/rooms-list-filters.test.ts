import { describe, expect, test } from 'bun:test'
import { and, eq, lt, sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { blackoutsList } from '#shared/utils/blackouts-list'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { externalSpacesList } from '#shared/utils/external-spaces-list'
import { roomsList } from '#shared/utils/rooms-list'
import { aliasColumns, tableColumns, whereFrom, yesNo } from '#server/utils/list-filters'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ListClause } from '#server/utils/list-filters'
import type { ListQuery, ListSpec } from '#shared/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The rooms module's declarations, proved against the real migrations (K-129 criterion 5):
// the bookable estate, its closures and the SU catalogue.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const parsed = (spec: ListSpec, query: Record<string, string>): ListQuery => {
  const result = filterQuerySchema(spec).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function select(database: TestDatabase, table: string, clause: ListClause, column = 'id'): string[] {
  const statement = sql`SELECT ${sql.raw(column)} AS value FROM ${sql.raw(table)}
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ value: string }>(database, text, ...parameters).map(row => row.value)
}

describe('the bookable estate filters on its declaration (K-129)', () => {
  function seed(database: TestDatabase): void {
    database.batch([
      ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, ?)', 'r-studio', 'The Studio', 1],
      ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, ?)', 'r-annex', 'Annex', 0],
      ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, ?)', 'r-green', 'Green Room', 1],
    ])
  }

  // roomsClause (server/utils/rooms.ts): whereFrom plus the same default the accounts directory
  // uses for an anonymised row, hiding a retired room unless the officer asks for one.
  function clause(query: ListQuery): ListClause {
    const built = whereFrom(roomsList, query, { column: tableColumns(schema.rooms), search: [schema.rooms.name] })
    const asked = conditionsOf(roomsList, query).some(condition => condition.key === 'active')
    return asked ? built : { ...built, where: and(eq(schema.rooms.isActive, true), built.where) }
  }

  test('retired rooms are hidden by default and shown only when asked', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(select(database, 'rooms', clause(parsed(roomsList, {})))).toEqual(['r-green', 'r-studio'])
      expect(select(database, 'rooms', clause(parsed(roomsList, { active: 'false' })))).toEqual(['r-annex'])
      expect(select(database, 'rooms', clause(parsed(roomsList, { active: 'true' })))).toEqual(['r-green', 'r-studio'])
    })
  })

  test('the name sort collates case-insensitively', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(select(database, 'rooms', clause(parsed(roomsList, { active: 'true', direction: 'desc' })))).toEqual(['r-studio', 'r-green'])
    })
  })

  test('the search box runs over the room name', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(select(database, 'rooms', clause(parsed(roomsList, { search: 'green' })))).toEqual(['r-green'])
    })
  })
})

describe('closures filter on their declaration (K-129)', () => {
  function seed(database: TestDatabase, now: number): void {
    database.batch([
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
      ['INSERT INTO room_blackouts (id, room_id, reason, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)',
        'b-past', 'r-studio', 'Fire alarm test', now - 7200, now - 3600],
      ['INSERT INTO room_blackouts (id, room_id, reason, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)',
        'b-future', 'r-studio', 'Get-in', now + 3600, now + 7200],
      ['INSERT INTO room_blackouts (id, room_id, reason, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)',
        'b-every', null, 'Building closure', now + 10_000, now + 20_000],
    ])
  }

  // blackoutsClause (server/utils/blackouts.ts): a past closure is hidden the same way a retired
  // room is, unless the officer asks for one.
  function clause(query: ListQuery, now: number): ListClause {
    const built = whereFrom(blackoutsList, query, {
      column: tableColumns(schema.roomBlackouts),
      search: [sql`coalesce((SELECT r.name FROM rooms r WHERE r.id = room_blackouts.room_id), 'every room')`, schema.roomBlackouts.reason],
      fields: { past: yesNo(lt(schema.roomBlackouts.endsAt, now)) },
    })
    const asked = conditionsOf(blackoutsList, query).some(condition => condition.key === 'past')
    return asked ? built : { ...built, where: and(sql`${schema.roomBlackouts.endsAt} >= ${now}`, built.where) }
  }

  test('a past closure is hidden by default and shown only when asked', async () => {
    const now = 1_800_000_000
    await withDatabase((database) => {
      seed(database, now)
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, {}), now))).toEqual(['b-future', 'b-every'])
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, { past: 'true' }), now))).toEqual(['b-past'])
    })
  })

  test('the sort is by when the closure starts, and the direction flips it', async () => {
    const now = 1_800_000_000
    await withDatabase((database) => {
      seed(database, now)
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, { past: 'true', direction: 'desc' }), now))).toEqual(['b-past'])
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, { direction: 'desc' }), now))).toEqual(['b-every', 'b-future'])
    })
  })

  test('the search box runs over the room and the reason', async () => {
    const now = 1_800_000_000
    await withDatabase((database) => {
      seed(database, now)
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, { search: 'get-in' }), now))).toEqual(['b-future'])
      expect(select(database, 'room_blackouts', clause(parsed(blackoutsList, { search: 'every room' }), now))).toEqual(['b-every'])
    })
  })
})

describe('the SU catalogue filters on its declaration (K-129)', () => {
  function seed(database: TestDatabase): void {
    database.batch([
      ['INSERT INTO external_spaces (id, name, building, campus, is_active) VALUES (?, ?, ?, ?, ?)', 's-c11', 'Portland C11', 'Portland Building', 'University Park', 1],
      ['INSERT INTO external_spaces (id, name, building, campus, is_active) VALUES (?, ?, ?, ?, ?)', 's-old', 'Old Seminar Room', 'Trent', 'Jubilee', 0],
    ])
  }

  // spacesClause (server/utils/external-spaces.ts): the same default-hidden-unless-asked rule.
  function clause(query: ListQuery): ListClause {
    const built = whereFrom(externalSpacesList, query, {
      column: tableColumns(schema.externalSpaces),
      search: [schema.externalSpaces.name, schema.externalSpaces.building, schema.externalSpaces.campus],
    })
    const asked = conditionsOf(externalSpacesList, query).some(condition => condition.key === 'active')
    return asked ? built : { ...built, where: and(eq(schema.externalSpaces.isActive, true), built.where) }
  }

  test('a retired room is hidden by default and shown only when asked', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(select(database, 'external_spaces', clause(parsed(externalSpacesList, {})))).toEqual(['s-c11'])
      expect(select(database, 'external_spaces', clause(parsed(externalSpacesList, { active: 'false' })))).toEqual(['s-old'])
    })
  })

  test('the search box runs over name, building and campus', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(select(database, 'external_spaces', clause(parsed(externalSpacesList, { active: 'false', search: 'trent' })))).toEqual(['s-old'])
      expect(select(database, 'external_spaces', clause(parsed(externalSpacesList, { search: 'university park' })))).toEqual(['s-c11'])
    })
  })
})

// Raw SQL through an alias round-trips the same as the query builder (shows-list.ts's binding),
// which is what a rooms endpoint written the same way would rely on.
describe('a rooms declaration binds through an alias too', () => {
  test('the estate filters the same way behind an alias', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, ?)', 'r-studio', 'The Studio', 1],
        ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, ?)', 'r-annex', 'Annex', 0],
      ])
      const clause = whereFrom(roomsList, parsed(roomsList, { active: 'false' }), { column: aliasColumns('rooms') })
      expect(select(database, 'rooms', clause)).toEqual(['r-annex'])
    })
  })
})
