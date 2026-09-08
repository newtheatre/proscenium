import { describe, expect, test } from 'bun:test'
import {
  closeStatement,
  exemptStatement,
  incidentsReviewedQuery,
  insertItemStatement,
  itemsForVenueQuery,
  noShowHoldsReleasedQuery,
  retireItemStatement,
  stampStatement,
  stampsForNightQuery,
  tickStatement,
  updateItemStatement,
} from '#server/utils/checklist'
import { recordIncidentStatement } from '#server/utils/incidents'
import { showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { ChecklistItemRow } from '#server/utils/checklist'
import type { TestDatabase } from '#tests/helpers/database'
import type { ChecklistItemInput } from '#shared/utils/checklist'
import type { SQL } from 'drizzle-orm'

// E-114 against the real migrations, exercising the pure statement and query builders directly:
// `server/utils/checklist.ts`'s async wrappers need the live `db` singleton and are covered by
// `tests/e2e/checklist.test.ts` instead. `tests/unit/checklist.test.ts` pins the pure validation.

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

const NIGHT = '2026-09-14'

function item(venueId: string, overrides: Partial<ChecklistItemInput> = {}): ChecklistItemInput {
  return { venueId, phase: 'PRE', label: 'Fire exits checked', sort: 1, required: true, systemCheck: null, ...overrides }
}

describe('committee configuration (criterion 1)', () => {
  test('an item is added and read back', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))

      const items = run(database, itemsForVenueQuery(venue.id, false))
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ label: 'Fire exits checked', phase: 'PRE', required: 1, systemCheck: null })
    })
  })

  test('editing an item does not touch a stamp already made (criterion 1)', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))

      const before = run(database, itemsForVenueQuery(venue.id, false))[0] as unknown as ChecklistItemRow
      run(database, stampStatement(before, venue.id, NIGHT, 'cs-1'))
      run(database, updateItemStatement('ci-1', item(venue.id, { label: 'Fire exits double-checked' }), officer))

      const stamps = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(stamps[0]?.label).toBe('Fire exits checked')
    })
  })

  test('a retired item stops appearing for new stamps but the item itself survives', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))
      run(database, retireItemStatement('ci-1', false, officer))

      expect(run(database, itemsForVenueQuery(venue.id, false))).toHaveLength(0)
      expect(run(database, itemsForVenueQuery(venue.id, true))).toHaveLength(1)
    })
  })
})

describe('stamping onto a venue\'s night (criteria 1, 2)', () => {
  test('stamping twice adds nothing the second time', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))
      const held = run(database, itemsForVenueQuery(venue.id, false))[0] as unknown as ChecklistItemRow

      run(database, stampStatement(held, venue.id, NIGHT, 'cs-1'))
      run(database, stampStatement(held, venue.id, NIGHT, 'cs-2'))

      expect(run(database, stampsForNightQuery(venue.id, NIGHT))).toHaveLength(1)
    })
  })

  test('two venues stamp independently', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const a = testVenue(database, { suffix: 'a' })
      const b = testVenue(database, { suffix: 'b' })
      run(database, insertItemStatement(item(a.id), officer, 'ci-a'))
      run(database, insertItemStatement(item(b.id), officer, 'ci-b'))
      const itemA = run(database, itemsForVenueQuery(a.id, false))[0] as unknown as ChecklistItemRow
      const itemB = run(database, itemsForVenueQuery(b.id, false))[0] as unknown as ChecklistItemRow

      run(database, stampStatement(itemA, a.id, NIGHT, 'cs-a'))
      run(database, stampStatement(itemB, b.id, NIGHT, 'cs-b'))

      expect(run(database, stampsForNightQuery(a.id, NIGHT))).toHaveLength(1)
      expect(run(database, stampsForNightQuery(b.id, NIGHT))).toHaveLength(1)
    })
  })
})

describe('ticking and exempting (criteria 2, 3, 5)', () => {
  function stampedItem(database: TestDatabase, venueId: string, officer: string, overrides: Partial<ChecklistItemInput> = {}): string {
    run(database, insertItemStatement(item(venueId, overrides), officer, 'ci-1'))
    const held = run(database, itemsForVenueQuery(venueId, false))[0] as unknown as ChecklistItemRow
    run(database, stampStatement(held, venueId, NIGHT, 'cs-1'))
    return 'cs-1'
  }

  test('a hand-ticked item ticks once', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer)

      expect(run(database, tickStatement(stampId, venue.id, NIGHT, officer))).toHaveLength(1)
      expect(run(database, tickStatement(stampId, venue.id, NIGHT, officer))).toHaveLength(0)

      const [after] = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(after?.tickedByName).toBe(`Someone ${officer}`)
    })
  })

  test('a system-verified item cannot be hand-ticked', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer, { systemCheck: 'INCIDENTS_REVIEWED', phase: 'POST' })

      expect(run(database, tickStatement(stampId, venue.id, NIGHT, officer))).toHaveLength(0)
    })
  })

  test('an exemption needs a reason and settles the item', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer)

      expect(run(database, exemptStatement(stampId, venue.id, NIGHT, 'Duty manager confirmed by phone', officer))).toHaveLength(1)
      const [after] = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(after).toMatchObject({ exempted: 1, exemptReason: 'Duty manager confirmed by phone' })
    })
  })

  test('a ticked item cannot also be exempted', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer)

      run(database, tickStatement(stampId, venue.id, NIGHT, officer))
      expect(run(database, exemptStatement(stampId, venue.id, NIGHT, 'Reason', officer))).toHaveLength(0)
    })
  })

  test('a stamp from another venue\'s night cannot be ticked here', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer)

      expect(run(database, tickStatement(stampId, 'venue-elsewhere', NIGHT, officer))).toHaveLength(0)
    })
  })
})

describe('the no-show-holds system check (criterion 3)', () => {
  test('nought unresolved with nothing held, one with a pending hold, nought once it resolves', async () => {
    await withDatabase((database) => {
      const made = tonightsPerformance(database, { night: NIGHT })

      expect(run(database, noShowHoldsReleasedQuery(made.venueId, NIGHT))[0]?.unresolved).toBe(0)

      database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
        'r-1', 'REF1', made.performanceId, 'PENDING', 'WEB']])
      expect(run(database, noShowHoldsReleasedQuery(made.venueId, NIGHT))[0]?.unresolved).toBe(1)

      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'NO_SHOW', 'r-1']])
      expect(run(database, noShowHoldsReleasedQuery(made.venueId, NIGHT))[0]?.unresolved).toBe(0)
    })
  })
})

describe('the incidents-reviewed system check (criterion 3)', () => {
  test('nought unreviewed with nothing logged, one until reviewed, nought once reviewed', async () => {
    await withDatabase((database) => {
      const made = tonightsPerformance(database, { night: NIGHT })
      const officer = person(database, 'officer')
      expect(run(database, incidentsReviewedQuery(NIGHT))[0]?.unreviewed).toBe(0)

      const happenedAt = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000) + 3600
      run(database, recordIncidentStatement(officer, made.performanceId, 'SAFETY', 'NOTE', 'Body', happenedAt, 'in-1').statement)
      expect(run(database, incidentsReviewedQuery(NIGHT))[0]?.unreviewed).toBe(1)

      database.batch([['INSERT INTO audit_log (id, actor_id, action, target) VALUES (?, ?, ?, ?)',
        'al-1', officer, 'incident.reviewed', 'incident:in-1']])
      expect(run(database, incidentsReviewedQuery(NIGHT))[0]?.unreviewed).toBe(0)
    })
  })
})

describe('the close-night action (criterion 4)', () => {
  test('closes once and is idempotent, decided from RETURNING', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)

      expect(run(database, closeStatement(venue.id, NIGHT, officer, 'cc-1'))).toHaveLength(1)
      expect(run(database, closeStatement(venue.id, NIGHT, officer, 'cc-2'))).toHaveLength(0)
    })
  })
})
