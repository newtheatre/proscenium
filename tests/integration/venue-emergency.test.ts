import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'
import { currentCardQuery, currentCardsQuery, emergencyCardsClause, recordCardStatement } from '#server/utils/venue-emergency'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { EmergencyCardInput } from '#shared/utils/venue-emergency'
import type { SQL } from 'drizzle-orm'

// E-113 against the real migrations. `tests/unit/venue-emergency.test.ts` pins the pure validation.

// The list with nothing asked of it: the default sort and no predicate (K-129).
const everyCardSchema = filterQuerySchema(emergencyCardsList)
const everyCard = () => emergencyCardsClause(everyCardSchema.parse({}))

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

const card = (overrides: Partial<EmergencyCardInput> = {}): EmergencyCardInput =>
  ({ assemblyPoint: 'The car park', exits: null, isolationPoints: null, what3words: null, notes: null, ...overrides })

describe('recording a version (criterion 1)', () => {
  test('a fresh version writes, and reading it back names the venue and the editor', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card(), officer, 'vei-1').statement)

      const [row] = run(database, currentCardQuery(venue.id))
      expect(row).toMatchObject({ id: 'vei-1', venueId: venue.id, assemblyPoint: 'The car park', updatedByName: `Someone ${officer}` })
    })
  })

  test('a second version is the new current one, and the first survives untouched', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card({ assemblyPoint: 'The old assembly point' }), officer, 'vei-1').statement)
      run(database, recordCardStatement(venue.id, card({ assemblyPoint: 'The new assembly point' }), officer, 'vei-2').statement)

      const [current] = run(database, currentCardQuery(venue.id))
      expect(current).toMatchObject({ id: 'vei-2', assemblyPoint: 'The new assembly point' })

      const history = rows<{ id: string, assembly_point: string }>(database,
        'SELECT id, assembly_point FROM venue_emergency_info WHERE venue_id = ? ORDER BY updated_at', venue.id)
      expect(history).toHaveLength(2)
      expect(history[0]).toMatchObject({ id: 'vei-1', assembly_point: 'The old assembly point' })
    })
  })
})

describe('the register is append-only (criterion 1)', () => {
  test('an update is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card(), officer, 'vei-1').statement)

      expect(() => database.batch([['UPDATE venue_emergency_info SET assembly_point = ? WHERE id = ?', 'Changed', 'vei-1']])).toThrow()
    })
  })

  test('a delete is refused at the database', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card(), officer, 'vei-1').statement)

      expect(() => database.batch([['DELETE FROM venue_emergency_info WHERE id = ?', 'vei-1']])).toThrow()
    })
  })

  test('a venue with a card refuses deletion rather than losing its history', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card(), officer, 'vei-1').statement)

      expect(() => database.batch([[`DELETE FROM venues WHERE id = ?`, venue.id]])).toThrow()
    })
  })
})

describe('the committee overview (criterion 1)', () => {
  test('a venue with no card yet still names itself', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'no-card' })

      const [row] = run(database, currentCardsQuery(everyCard(), 25, 0))
      expect(row).toMatchObject({ id: null, venueId: 'venue-no-card', assemblyPoint: null })
    })
  })

  test('every venue answers its own latest version', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const a = testVenue(database, { suffix: 'a' })
      const b = testVenue(database, { suffix: 'b' })
      run(database, recordCardStatement(a.id, card({ assemblyPoint: 'A car park' }), officer, 'vei-a').statement)
      run(database, recordCardStatement(b.id, card({ assemblyPoint: 'B car park' }), officer, 'vei-b').statement)

      const found = run(database, currentCardsQuery(everyCard(), 25, 0)) as { venueId: string, assemblyPoint: string }[]
      expect(found.find(row => row.venueId === a.id)?.assemblyPoint).toBe('A car park')
      expect(found.find(row => row.venueId === b.id)?.assemblyPoint).toBe('B car park')
    })
  })
})
