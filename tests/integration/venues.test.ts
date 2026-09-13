import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { venuesList } from '#shared/utils/venues-list'
import { VENUE_REFERENCES, venueInUseQuery, venuesClause, venuesQuery } from '#server/utils/venues'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-129: the declaration is what turns a raw query into a clause, the same route it takes live.
const venuesSchema = filterQuerySchema(venuesList)
function parsedVenues(raw: Record<string, string>) {
  const result = venuesSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return venuesClause(result.data)
}

// D-131. "In use" is the criterion the retire-versus-delete distinction turns on, and it is a
// question about rows in other tables rather than a flag on this one (echoing D-119).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function venue(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'v-1', name: 'The Theatre', ...over }
  insert(database, 'venues', values)
  return String(values.id)
}

function inUse(database: TestDatabase, statement: ReturnType<typeof venueInUseQuery>): boolean {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ inUse: number }>(database, query, ...parameters)[0]!.inUse === 1
}

describe('a venue is its own row, uniquely named (criterion 1, 0043)', () => {
  test('the name is held once across the whole system', async () => {
    await withDatabase((database) => {
      venue(database)
      expect(() => venue(database, { id: 'v-2' })).toThrow()
    })
  })

  test('the name is held once whatever the capitals', async () => {
    await withDatabase((database) => {
      venue(database)
      expect(() => venue(database, { id: 'v-2', name: 'THE THEATRE' })).toThrow()
      expect(() => venue(database, { id: 'v-3', name: 'the theatre' })).toThrow()
      expect(() => venue(database, { id: 'v-4', name: 'The Studio' })).not.toThrow()
    })
  })

  test('capacity is null (uncapped) or a positive number, never a bare zero', async () => {
    await withDatabase((database) => {
      expect(() => venue(database, { capacity: null })).not.toThrow()
      expect(() => venue(database, { id: 'v-2', name: 'Small room', capacity: 40 })).not.toThrow()
      expect(() => venue(database, { id: 'v-3', name: 'No room', capacity: 0 })).toThrow()
    })
  })

  test('a room is optional, and pointing at one carries no other inference', async () => {
    await withDatabase((database) => {
      insert(database, 'rooms', { id: 'r-1', name: 'Green Room' })
      expect(() => venue(database, { room_id: 'r-1' })).not.toThrow()
    })
  })
})

describe('"in use" is a query over rows, never a flag (criterion 4)', () => {
  test('the table carries no column that could stand in for the predicate', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('venues')`)
        .map(column => column.name)
      expect(columns.filter(name => /in_use|used/.test(name))).toEqual([])
    })
  })

  // The one that fails when a new table points at venues: it is in use through this row or it is
  // not, and somebody has to say which.
  test('every table pointing at venues is declared in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'venues') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = VENUE_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('a fresh venue is not in use', async () => {
    await withDatabase((database) => {
      const id = venue(database)
      expect(inUse(database, venueInUseQuery(id))).toBe(false)
    })
  })

  test('a performance flips it, and nothing on the venue itself changed', async () => {
    await withDatabase((database) => {
      const id = venue(database)
      insert(database, 'shows', { id: 's-1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'performances', { id: 'p-1', show_id: 's-1', venue_id: id, starts_at: 0 })
      expect(inUse(database, venueInUseQuery(id))).toBe(true)
    })
  })
})

describe('the listing is searched, filtered and paged in SQL', () => {
  test('a search matches without regard to capitals, combined with the retired filter by AND', async () => {
    await withDatabase((database) => {
      venue(database)
      venue(database, { id: 'v-2', name: 'The Studio' })
      venue(database, { id: 'v-3', name: 'Retired room', archived: 1 })

      const [query, ...parameters] = boundStatement(database, venuesQuery(parsedVenues({ archived: 'false', search: 'the' }), 25, 0))
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id).sort()).toEqual(['v-1', 'v-2'])
    })
  })

  test('the archived filter and the page window are the same question the count asks', async () => {
    await withDatabase((database) => {
      venue(database)
      venue(database, { id: 'v-2', name: 'The Studio' })
      venue(database, { id: 'v-3', name: 'Retired room', archived: 1 })

      // Ordered by name: "The Studio" sorts before "The Theatre", so offset 1 lands on the latter.
      const [query, ...parameters] = boundStatement(database, venuesQuery(parsedVenues({ archived: 'false' }), 1, 1))
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['v-1'])
    })
  })

  test('no filter shows every venue, retired included', async () => {
    await withDatabase((database) => {
      venue(database)
      venue(database, { id: 'v-2', name: 'Retired room', archived: 1 })

      const [query, ...parameters] = boundStatement(database, venuesQuery(parsedVenues({}), 25, 0))
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id).sort()).toEqual(['v-1', 'v-2'])
    })
  })
})

describe('the listing column agrees with the single-row question', () => {
  test('venueInUseColumn matches venueInUseQuery for a free and a held venue alike', async () => {
    await withDatabase((database) => {
      const free = venue(database)
      const held = venue(database, { id: 'v-2', name: 'The Studio' })
      insert(database, 'shows', { id: 's-1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'performances', { id: 'p-1', show_id: 's-1', venue_id: held, starts_at: 0 })

      const [query, ...parameters] = boundStatement(database, venuesQuery(parsedVenues({}), 25, 0))
      const listed = rows<{ id: string, inUse: number }>(database, query, ...parameters)
      expect(listed.find(row => row.id === free)?.inUse).toBe(0)
      expect(listed.find(row => row.id === held)?.inUse).toBe(1)
    })
  })
})
