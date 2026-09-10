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
  stampsForPerformanceQuery,
  tickStatement,
  updateItemStatement,
} from '#server/utils/checklist'
import { recordIncidentStatement } from '#server/utils/incidents'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { ChecklistItemRow } from '#server/utils/checklist'
import type { TestDatabase } from '#tests/helpers/database'
import type { ChecklistItemInput } from '#shared/utils/checklist'
import type { SQL } from 'drizzle-orm'

// E-114's pure statement and query builders against the real migrations, keyed to a performance
// (E-128). The async wrappers need the live `db` singleton, covered by `tests/e2e/checklist.test.ts`.

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
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId), officer, 'ci-1'))

      const before = run(database, itemsForVenueQuery(venueId, false))[0] as unknown as ChecklistItemRow
      run(database, stampStatement(before, performanceId, 'cs-1'))
      run(database, updateItemStatement('ci-1', item(venueId, { label: 'Fire exits double-checked' }), officer))

      const stamps = run(database, stampsForPerformanceQuery(performanceId))
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

describe('stamping onto a performance (criteria 1, 2, E-128)', () => {
  test('stamping twice adds nothing the second time', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId), officer, 'ci-1'))
      const held = run(database, itemsForVenueQuery(venueId, false))[0] as unknown as ChecklistItemRow

      run(database, stampStatement(held, performanceId, 'cs-1'))
      run(database, stampStatement(held, performanceId, 'cs-2'))

      expect(run(database, stampsForPerformanceQuery(performanceId))).toHaveLength(1)
    })
  })

  test('two venues stamp independently', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const a = tonightsPerformance(database, { suffix: 'a' })
      const b = tonightsPerformance(database, { suffix: 'b' })
      run(database, insertItemStatement(item(a.venueId), officer, 'ci-a'))
      run(database, insertItemStatement(item(b.venueId), officer, 'ci-b'))
      const itemA = run(database, itemsForVenueQuery(a.venueId, false))[0] as unknown as ChecklistItemRow
      const itemB = run(database, itemsForVenueQuery(b.venueId, false))[0] as unknown as ChecklistItemRow

      run(database, stampStatement(itemA, a.performanceId, 'cs-a'))
      run(database, stampStatement(itemB, b.performanceId, 'cs-b'))

      expect(run(database, stampsForPerformanceQuery(a.performanceId))).toHaveLength(1)
      expect(run(database, stampsForPerformanceQuery(b.performanceId))).toHaveLength(1)
    })
  })

  // The point of E-128: a matinee and an evening at the same venue never share a stamp.
  test('two performances at the same venue stamp independently', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const matinee = tonightsPerformance(database, { suffix: 'matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
      run(database, insertItemStatement(item(venue.id), officer, 'ci-1'))
      const held = run(database, itemsForVenueQuery(venue.id, false))[0] as unknown as ChecklistItemRow

      run(database, stampStatement(held, matinee.performanceId, 'cs-matinee'))
      expect(run(database, stampsForPerformanceQuery(matinee.performanceId))).toHaveLength(1)
      expect(run(database, stampsForPerformanceQuery(evening.performanceId))).toHaveLength(0)

      run(database, tickStatement('cs-matinee', matinee.performanceId, officer))
      run(database, ensureStampedStatement(evening.performanceId))
      const [eveningStamp] = run(database, stampsForPerformanceQuery(evening.performanceId))
      expect(eveningStamp?.tickedAt ?? null).toBeNull()
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

describe('ensureStampedStatement, the whole-performance stamp (criteria 1, 2, 0006)', () => {
  test('one set-based write stamps every active item, none of a retired one', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId, { label: 'Fire exits checked' }), officer, 'ci-1'))
      run(database, insertItemStatement(item(venueId, { label: 'Till float counted' }), officer, 'ci-2'))
      run(database, insertItemStatement(item(venueId, { label: 'Retired before tonight' }), officer, 'ci-3'))
      run(database, retireItemStatement('ci-3', false, officer))

      const written = run(database, ensureStampedStatement(performanceId))
      expect(written).toHaveLength(2)

      const stamps = run(database, stampsForPerformanceQuery(performanceId))
      expect(stamps.map(stamp => stamp.label).sort()).toEqual(['Fire exits checked', 'Till float counted'])
    })
  })

  test('running it again writes nothing more: a fully stamped performance conflicts on every row', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId), officer, 'ci-1'))

      expect(run(database, ensureStampedStatement(performanceId))).toHaveLength(1)
      expect(run(database, ensureStampedStatement(performanceId))).toHaveLength(0)
      expect(run(database, stampsForPerformanceQuery(performanceId))).toHaveLength(1)
    })
  })

  test('an item added after the performance is already stamped is picked up, still with no duplicate', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId, { label: 'Fire exits checked' }), officer, 'ci-1'))
      expect(run(database, ensureStampedStatement(performanceId))).toHaveLength(1)

      run(database, insertItemStatement(item(venueId, { label: 'Added mid-night' }), officer, 'ci-2'))
      const written = run(database, ensureStampedStatement(performanceId))
      expect(written).toHaveLength(1)
      expect(run(database, stampsForPerformanceQuery(performanceId))).toHaveLength(2)
    })
  })

  test('a performance with nothing configured at its venue writes nothing', async () => {
    await withDatabase(async (database) => {
      const { performanceId } = tonightsPerformance(database)
      expect(run(database, ensureStampedStatement(performanceId))).toHaveLength(0)
    })
  })
})

describe('ticking and exempting (criteria 2, 3, 5)', () => {
  function stampedItem(database: TestDatabase, venueId: string, performanceId: string, officer: string, overrides: Partial<ChecklistItemInput> = {}): string {
    run(database, insertItemStatement(item(venueId, overrides), officer, 'ci-1'))
    const held = run(database, itemsForVenueQuery(venueId, false))[0] as unknown as ChecklistItemRow
    run(database, stampStatement(held, performanceId, 'cs-1'))
    return 'cs-1'
  }

  test('a hand-ticked item ticks once', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer)

      expect(run(database, tickStatement(stampId, performanceId, officer))).toHaveLength(1)
      expect(run(database, tickStatement(stampId, performanceId, officer))).toHaveLength(0)

      const [after] = run(database, stampsForPerformanceQuery(performanceId))
      expect(after?.tickedByName).toBe(`Someone ${officer}`)
    })
  })

  test('a system-verified item cannot be hand-ticked', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer, { systemCheck: 'INCIDENTS_REVIEWED', phase: 'POST' })

      expect(run(database, tickStatement(stampId, performanceId, officer))).toHaveLength(0)
    })
  })

  test('a system-verified item cannot be exempted either: recording one would be audited and have no effect', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer, { systemCheck: 'INCIDENTS_REVIEWED', phase: 'POST' })

      expect(run(database, exemptStatement(stampId, performanceId, 'Reason', officer))).toHaveLength(0)
      const [after] = run(database, stampsForPerformanceQuery(performanceId))
      expect(after).toMatchObject({ exempted: 0, exemptReason: null })
    })
  })

  test('an exemption needs a reason and settles the item', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer)

      expect(run(database, exemptStatement(stampId, performanceId, 'Duty manager confirmed by phone', officer))).toHaveLength(1)
      const [after] = run(database, stampsForPerformanceQuery(performanceId))
      expect(after).toMatchObject({ exempted: 1, exemptReason: 'Duty manager confirmed by phone' })
    })
  })

  test('a ticked item cannot also be exempted', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer)

      run(database, tickStatement(stampId, performanceId, officer))
      expect(run(database, exemptStatement(stampId, performanceId, 'Reason', officer))).toHaveLength(0)
    })
  })

  test('a stamp from another performance cannot be ticked here', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      const stampId = stampedItem(database, venueId, performanceId, officer)
      const elsewhere = tonightsPerformance(database, { suffix: 'elsewhere' })

      expect(run(database, tickStatement(stampId, elsewhere.performanceId, officer))).toHaveLength(0)
    })
  })

  test('pre-show always lists above post-show on the stamped list too', async () => {
    await withDatabase(async (database) => {
      const officer = person(database, 'officer')
      const { venueId, performanceId } = tonightsPerformance(database)
      run(database, insertItemStatement(item(venueId, { phase: 'POST', label: 'Till reconciled', sort: 1 }), officer, 'ci-post'))
      run(database, insertItemStatement(item(venueId, { phase: 'PRE', label: 'Fire exits checked', sort: 1 }), officer, 'ci-pre'))
      run(database, ensureStampedStatement(performanceId))

      const stamps = run(database, stampsForPerformanceQuery(performanceId))
      expect(stamps.map(stamp => stamp.phase)).toEqual(['PRE', 'POST'])
    })
  })
})

describe('the no-show-holds system check (criterion 3)', () => {
  test('nought unresolved with nothing held, one with a pending hold, nought once it resolves', async () => {
    await withDatabase((database) => {
      const made = tonightsPerformance(database)

      expect(run(database, noShowHoldsReleasedQuery(made.performanceId))[0]?.unresolved).toBe(0)

      database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
        'r-1', 'REF1', made.performanceId, 'PENDING', 'WEB']])
      expect(run(database, noShowHoldsReleasedQuery(made.performanceId))[0]?.unresolved).toBe(1)

      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'NO_SHOW', 'r-1']])
      expect(run(database, noShowHoldsReleasedQuery(made.performanceId))[0]?.unresolved).toBe(0)
    })
  })

  // E-128: the check is this performance's own reservations, so a matinee's outstanding hold
  // never trips the evening's checklist.
  test('a pending hold on another performance does not trip this one\'s check', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      const matinee = tonightsPerformance(database, { suffix: 'matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
      database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
        'r-1', 'REF1', matinee.performanceId, 'PENDING', 'WEB']])

      expect(run(database, noShowHoldsReleasedQuery(matinee.performanceId))[0]?.unresolved).toBe(1)
      expect(run(database, noShowHoldsReleasedQuery(evening.performanceId))[0]?.unresolved).toBe(0)
    })
  })
})

describe('the incidents-reviewed system check (criterion 3)', () => {
  test('nought unreviewed with nothing logged, one until reviewed, nought once reviewed', async () => {
    await withDatabase((database) => {
      const made = tonightsPerformance(database)
      const officer = person(database, 'officer')
      expect(run(database, incidentsReviewedQuery(made.performanceId))[0]?.unreviewed).toBe(0)

      run(database, recordIncidentStatement(officer, made.performanceId, 'SAFETY', 'NOTE', 'Body', Math.floor(Date.now() / 1000), 'in-1').statement)
      expect(run(database, incidentsReviewedQuery(made.performanceId))[0]?.unreviewed).toBe(1)

      database.batch([['INSERT INTO audit_log (id, actor_id, action, target) VALUES (?, ?, ?, ?)',
        'al-1', officer, 'incident.reviewed', 'incident:in-1']])
      expect(run(database, incidentsReviewedQuery(made.performanceId))[0]?.unreviewed).toBe(0)
    })
  })

  // 0043, E-127, E-128: two performances can run one venue one night, and one performance's
  // unreviewed incident must never trip the other's checklist item, whether at the same venue or not.
  test('an unreviewed incident at another performance does not trip this one\'s check', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      const a = tonightsPerformance(database, { suffix: 'a', venueId: venue.id, curtainHoursAfterNightStart: 10 })
      const b = tonightsPerformance(database, { suffix: 'b', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
      const officer = person(database, 'officer')
      run(database, recordIncidentStatement(officer, b.performanceId, 'SAFETY', 'NOTE', 'Body', Math.floor(Date.now() / 1000), 'in-b').statement)

      expect(run(database, incidentsReviewedQuery(a.performanceId))[0]?.unreviewed).toBe(0)
      expect(run(database, incidentsReviewedQuery(b.performanceId))[0]?.unreviewed).toBe(1)
    })
  })
})

describe('the close-night action (criterion 4)', () => {
  test('closes once and is idempotent, decided from RETURNING', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const { performanceId } = tonightsPerformance(database)

      expect(run(database, closeStatement(performanceId, officer, 'cc-1'))).toHaveLength(1)
      expect(run(database, closeStatement(performanceId, officer, 'cc-2'))).toHaveLength(0)
    })
  })

  // E-128 criterion 5: closing the matinee does not touch the evening.
  test('two performances at the same venue close independently', async () => {
    await withDatabase((database) => {
      const officer = person(database, 'officer')
      const venue = testVenue(database)
      const matinee = tonightsPerformance(database, { suffix: 'matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })

      expect(run(database, closeStatement(matinee.performanceId, officer, 'cc-matinee'))).toHaveLength(1)
      expect(run(database, closeStatement(evening.performanceId, officer, 'cc-evening'))).toHaveLength(1)
    })
  })
})
