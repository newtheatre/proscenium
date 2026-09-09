import { describe, expect, test } from 'bun:test'
import {
  closeStatement,
  ensureStampedStatement,
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

// E-114's pure statement and query builders against the real migrations. The async wrappers
// need the live `db` singleton, covered by `tests/e2e/checklist.test.ts` instead.

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

  test('pre-show always lists above post-show, whatever order the items were added', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id, { phase: 'POST', label: 'Till reconciled', sort: 1 }), officer, 'ci-post'))
      run(database, insertItemStatement(item(venue.id, { phase: 'PRE', label: 'Fire exits checked', sort: 1 }), officer, 'ci-pre'))

      const items = run(database, itemsForVenueQuery(venue.id, false))
      expect(items.map(row => row.phase)).toEqual(['PRE', 'POST'])
    })
  })
})

describe('ensureStampedStatement, the whole-venue stamp (criteria 1, 2, 0006)', () => {
  test('one set-based write stamps every active item, none of a retired one', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id, { label: 'Fire exits checked' }), officer, 'ci-1'))
      run(database, insertItemStatement(item(venue.id, { label: 'Till float counted' }), officer, 'ci-2'))
      run(database, insertItemStatement(item(venue.id, { label: 'Retired before tonight' }), officer, 'ci-3'))
      run(database, retireItemStatement('ci-3', false, officer))

      const written = run(database, ensureStampedStatement(venue.id, NIGHT))
      expect(written).toHaveLength(2)

      const stamps = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(stamps.map(stamp => stamp.label).sort()).toEqual(['Fire exits checked', 'Till float counted'])
    })
  })

  test('running it again writes nothing more: a fully stamped night conflicts on every row', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))

      expect(run(database, ensureStampedStatement(venue.id, NIGHT))).toHaveLength(1)
      expect(run(database, ensureStampedStatement(venue.id, NIGHT))).toHaveLength(0)
      expect(run(database, stampsForNightQuery(venue.id, NIGHT))).toHaveLength(1)
    })
  })

  test('an item added after the night is already stamped is picked up, still with no duplicate', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id, { label: 'Fire exits checked' }), officer, 'ci-1'))
      expect(run(database, ensureStampedStatement(venue.id, NIGHT))).toHaveLength(1)

      run(database, insertItemStatement(item(venue.id, { label: 'Added mid-night' }), officer, 'ci-2'))
      const written = run(database, ensureStampedStatement(venue.id, NIGHT))
      expect(written).toHaveLength(1)
      expect(run(database, stampsForNightQuery(venue.id, NIGHT))).toHaveLength(2)
    })
  })

  test('a venue with nothing configured writes nothing', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      expect(run(database, ensureStampedStatement(venue.id, NIGHT))).toHaveLength(0)
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

  test('a system-verified item cannot be exempted either: recording one would be audited and have no effect', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const stampId = stampedItem(database, venue.id, officer, { systemCheck: 'INCIDENTS_REVIEWED', phase: 'POST' })

      expect(run(database, exemptStatement(stampId, venue.id, NIGHT, 'Reason', officer))).toHaveLength(0)
      const [after] = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(after).toMatchObject({ exempted: 0, exemptReason: null })
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

  test('pre-show always lists above post-show on the stamped list too', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      run(database, insertItemStatement(item(venue.id, { phase: 'POST', label: 'Till reconciled', sort: 1 }), officer, 'ci-post'))
      run(database, insertItemStatement(item(venue.id, { phase: 'PRE', label: 'Fire exits checked', sort: 1 }), officer, 'ci-pre'))
      run(database, ensureStampedStatement(venue.id, NIGHT))

      const stamps = run(database, stampsForNightQuery(venue.id, NIGHT))
      expect(stamps.map(stamp => stamp.phase)).toEqual(['PRE', 'POST'])
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
      expect(run(database, incidentsReviewedQuery(made.venueId, NIGHT))[0]?.unreviewed).toBe(0)

      const happenedAt = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000) + 3600
      run(database, recordIncidentStatement(officer, made.performanceId, 'SAFETY', 'NOTE', 'Body', happenedAt, 'in-1').statement)
      expect(run(database, incidentsReviewedQuery(made.venueId, NIGHT))[0]?.unreviewed).toBe(1)

      database.batch([['INSERT INTO audit_log (id, actor_id, action, target) VALUES (?, ?, ?, ?)',
        'al-1', officer, 'incident.reviewed', 'incident:in-1']])
      expect(run(database, incidentsReviewedQuery(made.venueId, NIGHT))[0]?.unreviewed).toBe(0)
    })
  })

  // 0043, E-127: two venues can run the same night, and one venue's unreviewed incident must
  // never trip the other's checklist item, nor let reviewing the wrong venue's clear it.
  test('an unreviewed incident at another venue does not trip this one\'s check', async () => {
    await withDatabase((database) => {
      const a = tonightsPerformance(database, { night: NIGHT, suffix: 'a' })
      const b = tonightsPerformance(database, { night: NIGHT, suffix: 'b' })
      const officer = person(database, 'officer')
      const happenedAt = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000) + 3600
      run(database, recordIncidentStatement(officer, b.performanceId, 'SAFETY', 'NOTE', 'Body', happenedAt, 'in-b').statement)

      expect(run(database, incidentsReviewedQuery(a.venueId, NIGHT))[0]?.unreviewed).toBe(0)
      expect(run(database, incidentsReviewedQuery(b.venueId, NIGHT))[0]?.unreviewed).toBe(1)
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
