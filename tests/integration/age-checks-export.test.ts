import { describe, expect, test } from 'bun:test'
import { recordAgeCheck, supersedeAgeCheck } from '#server/utils/age-checks'
import { exportQuery } from '#server/utils/age-checks-export'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { AgeCheckInput } from '#shared/utils/age-checks'
import type { SQL } from 'drizzle-orm'

// E-119's export query against the real migrations, including the venue join and the
// supersede chain. `tests/e2e/age-checks-export.test.ts` covers the CSV and PDF routes.

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

const accepted: AgeCheckInput = {
  performanceId: null, outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null,
  description: 'Tall man, grey coat', product: 'Strongbow', notes: null,
}

const WITHIN_RANGE = 1_700_100_000
const OUT_OF_RANGE = 1_600_000_000

describe('the date range (criterion 1)', () => {
  test('only entries inside the range are exported, in time order', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-early', new Date(OUT_OF_RANGE * 1000)).statement)
      run(database, recordAgeCheck(officer, accepted, 'ac-in-range', new Date(WITHIN_RANGE * 1000)).statement)

      const found = run(database, exportQuery(WITHIN_RANGE - 3600, WITHIN_RANGE + 3600))
      expect(found.map(row => row.id)).toEqual(['ac-in-range'])
    })
  })

  test('a check names its venue when it has a performance, and null otherwise', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const tonight = tonightsPerformance(database)
      run(database, recordAgeCheck(officer, { ...accepted, performanceId: tonight.performanceId }, 'ac-venued', new Date(WITHIN_RANGE * 1000)).statement)
      run(database, recordAgeCheck(officer, accepted, 'ac-bar', new Date(WITHIN_RANGE * 1000)).statement)

      const found = run(database, exportQuery(WITHIN_RANGE - 3600, WITHIN_RANGE + 3600))
      expect(found.find(row => row.id === 'ac-venued')?.venueName).not.toBeNull()
      expect(found.find(row => row.id === 'ac-bar')?.venueName).toBeNull()
    })
  })
})

describe('nothing is omitted (criterion 2)', () => {
  test('a superseded entry and its correction both appear, with the link intact', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      run(database, recordAgeCheck(officer, accepted, 'ac-1', new Date(WITHIN_RANGE * 1000)).statement)
      run(database, supersedeAgeCheck(officer, 'ac-1', accepted, 'ac-2', new Date(WITHIN_RANGE * 1000)).statement)

      const found = run(database, exportQuery(WITHIN_RANGE - 3600, WITHIN_RANGE + 3600))
      expect(found.map(row => row.id).sort()).toEqual(['ac-1', 'ac-2'])
      expect(found.find(row => row.id === 'ac-1')?.supersededBy).toBe('ac-2')
      expect(found.find(row => row.id === 'ac-2')?.supersedesId).toBe('ac-1')
    })
  })
})
