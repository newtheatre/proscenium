import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'
import { cardVersionsQuery, currentCardQuery, currentCardsQuery, emergencyCardsClause, performanceCardFiledQuery, recordCardStatement, unfiledTonightQuery } from '#server/utils/venue-emergency'
import { showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
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

const card = (overrides: Partial<EmergencyCardInput> = {}): EmergencyCardInput => ({
  address: 'The Nottingham New Theatre, Nottingham NG7 2RD',
  assemblyPoint: 'The car park',
  exits: null,
  isolationPoints: null,
  firstAidKit: null,
  defibrillator: null,
  firstAiders: null,
  firePanel: null,
  what3words: null,
  notes: null,
  firstCallName: null,
  firstCallPhone: null,
  ...overrides,
})

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

  // Issue 902: the line read to a 999 handler, the two first-aid locations and the fire panel all
  // survive the round trip, or the screen that reads them back shows nothing where they were.
  test('the address, the first-aid locations and the fire panel all come back', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card({
        firstAidKit: 'Behind the bar',
        defibrillator: 'Foyer wall by the box office',
        firstAiders: 'Marian, Tuck',
        firePanel: 'Foyer, left of the main doors',
      }), officer, 'vei-1').statement)

      const [row] = run(database, currentCardQuery(venue.id))
      expect(row).toMatchObject({
        address: 'The Nottingham New Theatre, Nottingham NG7 2RD',
        firstAidKit: 'Behind the bar',
        defibrillator: 'Foyer wall by the box office',
        firstAiders: 'Marian, Tuck',
        firePanel: 'Foyer, left of the main doors',
      })
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

// Issue 1519: who a campus venue rings first survives the round trip, on the night and on the
// committee's overview alike, and a card that names nobody still reads null for both.
describe('every version of a card is read back, newest first (0217)', () => {
  test('two versions page one at a time, each naming who filed it', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, recordCardStatement(venue.id, card({ assemblyPoint: 'First' }), officer, 'vei-1').statement)
      run(database, recordCardStatement(venue.id, card({ assemblyPoint: 'Second' }), officer, 'vei-2').statement)

      expect(run(database, cardVersionsQuery(venue.id, 10, 0)).map(row => row.assemblyPoint)).toEqual(['Second', 'First'])
      expect(run(database, cardVersionsQuery(venue.id, 1, 1))).toMatchObject([{ assemblyPoint: 'First', updatedByName: `Someone ${officer}` }])
    })
  })
})

describe('who to ring first (issue 1519)', () => {
  test('a named first call comes back on the current card and the overview', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const campus = testVenue(database, { suffix: 'campus' })
      const town = testVenue(database, { suffix: 'town' })
      run(database, recordCardStatement(campus.id, card({ firstCallName: 'University Security', firstCallPhone: '0115 951 8888' }), officer, 'vei-campus').statement)
      run(database, recordCardStatement(town.id, card(), officer, 'vei-town').statement)

      const [current] = run(database, currentCardQuery(campus.id))
      expect(current).toMatchObject({ firstCallName: 'University Security', firstCallPhone: '0115 951 8888' })

      const found = run(database, currentCardsQuery(everyCard(), 25, 0)) as { venueId: string, firstCallName: string | null, firstCallPhone: string | null }[]
      expect(found.find(row => row.venueId === campus.id)).toMatchObject({ firstCallName: 'University Security', firstCallPhone: '0115 951 8888' })
      expect(found.find(row => row.venueId === town.id)).toMatchObject({ firstCallName: null, firstCallPhone: null })
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

  // Issue 1352: the card's address is prefilled once from the venue's address for audiences.
  test('each row carries the venue\'s address for audiences beside the card\'s own', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const carded = testVenue(database, { suffix: 'carded' })
      const bare = testVenue(database, { suffix: 'bare' })
      database.batch([
        ['UPDATE venues SET address = ? WHERE id = ?', 'Cherry Tree Hill, Nottingham NG7 2RD', carded.id],
        ['UPDATE venues SET address = ? WHERE id = ?', 'University Park, Nottingham NG7 2RD', bare.id],
      ])
      run(database, recordCardStatement(carded.id, card({ address: 'Stage door, Cherry Tree Hill' }), officer, 'vei-c').statement)

      const found = run(database, currentCardsQuery(everyCard(), 25, 0)) as { venueId: string, address: string | null, venueAddress: string | null }[]
      expect(found.find(row => row.venueId === carded.id)).toMatchObject({ address: 'Stage door, Cherry Tree Hill', venueAddress: 'Cherry Tree Hill, Nottingham NG7 2RD' })
      expect(found.find(row => row.venueId === bare.id)).toMatchObject({ address: null, venueAddress: 'University Park, Nottingham NG7 2RD' })
    })
  })
})

// The 21 October process map: The Studio ran with no card and nothing said so before doors (0237).
describe('a running venue with no filed card is named', () => {
  test('until its card carries an address, on the console and on the house', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer-unfiled')
      const house = tonightsPerformance(database, { suffix: 'unfiled' })
      const { from, to } = showNightBounds(house.night)
      const tonight = (): Record<string, unknown>[] => run(database, unfiledTonightQuery(Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)))

      expect(tonight()).toEqual([{ venueName: expect.any(String) }])
      expect(run(database, performanceCardFiledQuery(house.performanceId))).toEqual([{ filed: 0 }])

      run(database, recordCardStatement(house.venueId, card(), officer, 'vei-unfiled').statement)
      expect(tonight()).toEqual([])
      expect(run(database, performanceCardFiledQuery(house.performanceId))).toEqual([{ filed: 1 }])
    })
  })
})
