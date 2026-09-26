import { describe, expect, test } from 'bun:test'
import {
  addShiftStatement,
  approveShiftStatement,
  assignShiftStatement,
  backfillVenueStatement,
  cancelOrphanedShiftsStatement,
  cancelShiftsStatement,
  claimShiftStatement,
  confirmedShiftsTonightQuery,
  countOpenShiftsQuery,
  declineShiftStatement,
  dismissShiftStatement,
  dropExternalTemplateStatements,
  myShiftsQuery,
  onShiftTonightQuery,
  openShiftsQuery,
  releaseShiftStatement,
  replaceTemplateStatements,
  stampableSlotsQuery,
  stampPerformanceStatement,
  stampUnstampedStatement,
  unstaffedPerformancesQuery,
} from '#server/utils/rota'
import { venueInUseQuery } from '#server/utils/venues'
import { auditEntry } from '#shared/utils/audit'
import { daysAfter } from '#shared/utils/membership'
import { shiftConstraintRefusal } from '#shared/utils/rota'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { OpenShiftRow } from '#server/utils/rota'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-101, E-102 and E-106 against the real migrations. The two staffing invariants are the
// database's, so they are attempted here in SQL and not only through a route (E-106 criterion 4).

// The house defaults a route would read from configuration (0078); a venue template may
// override either offset, which `tests/integration/rota-timings.test.ts` is where it is pinned.
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

interface Shift { id: string, performance_id: string, role: string, slot: number, user_id: string | null, status: string, claimed_at: number | null, confirmed_at: number | null, decline_reason: string | null }

function shiftsOn(database: TestDatabase, performanceId: string): Shift[] {
  return rows<Shift>(database,
    'SELECT id, performance_id, role, slot, user_id, status, claimed_at, confirmed_at, decline_reason FROM shifts WHERE performance_id = ? ORDER BY role, slot',
    performanceId)
}

// What a route would hand back. Proving the mapping here is what keeps a raw database error
// from ever reaching a caller (E-106 criterion 3).
function refusalFor(write: () => void): { statusCode: number, statusMessage: string } | null {
  try {
    write()
    return null
  }
  catch (error) {
    const refusal = shiftConstraintRefusal(error)
    if (!refusal) throw error
    return refusal
  }
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

// A house template: one duty manager, two on the door and one behind the bar.
function template(database: TestDatabase, venueId: string, actorId = 'actor'): void {
  person(database, actorId)
  const slots = [
    { role: 'DUTY_MANAGER' as const, count: 1 },
    { role: 'DOOR' as const, count: 2 },
    { role: 'BAR' as const, count: 1 },
  ]
  for (const statement of replaceTemplateStatements(venueId, slots, actorId)) run(database, statement)
}

describe('a template stamps a rota onto a performance (E-102 criteria 1 and 3)', () => {
  test('one open shift per slot, with nobody named', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)

      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))

      const stamped = shiftsOn(database, tonight.performanceId)
      expect(stamped.length).toBe(4)
      expect(stamped.every(shift => shift.status === 'OPEN')).toBe(true)
      expect(stamped.every(shift => shift.user_id === null)).toBe(true)
      expect(stamped.map(shift => `${shift.role}:${shift.slot}`).sort())
        .toEqual(['BAR:1', 'DOOR:1', 'DOOR:2', 'DUTY_MANAGER:1'])
    })
  })

  test('a venue with no template stamps nothing and does not fail (E-101 criterion 4)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })

  test('a cancelled performance is never stamped', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database, { status: 'CANCELLED' })
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })
})

// A flag set straight on the row, leaving behind the template the venue edit would have cleared:
// the stale row older data can still hold, which every read must ignore (E-101 criterion 5).
function external(database: TestDatabase, venueId: string): void {
  database.batch([['UPDATE venues SET is_external = 1 WHERE id = ?', venueId]])
}

describe('an external venue is staffed ad hoc, never from a template (E-101 criterion 5)', () => {
  test('a performance at an external venue with no template stamps nothing and does not fail', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      external(database, tonight.venueId)
      expect(() => run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))).not.toThrow()
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })

  test('a template left on a venue since marked external is stamped by neither path', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      external(database, tonight.venueId)

      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })

  test('an officer can still add a shift by hand at an external venue', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      external(database, tonight.venueId)

      run(database, addShiftStatement('shift-external', {
        performanceId: tonight.performanceId, role: 'DUTY_MANAGER', slot: 1,
      }, 'actor', OFFSETS))

      const added = shiftsOn(database, tonight.performanceId)
      expect(added.map(shift => `${shift.role}:${shift.slot}:${shift.status}`)).toEqual(['DUTY_MANAGER:1:OPEN'])
    })
  })
})

describe('a venue marked external loses its template in the same batch (E-101 criterion 5)', () => {
  const dropped = (venueId: string) => auditEntry({ actorId: 'actor', action: 'shift-template.removed', target: `venue:${venueId}` })

  test('the rows go, one audit entry names the slots and nobody, and the venue can be deleted', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'going-external' })
      template(database, venue.id)
      external(database, venue.id)

      const entry = dropped(venue.id)
      for (const statement of dropExternalTemplateStatements(venue.id, entry)) run(database, statement)

      expect(rows(database, 'SELECT 1 FROM shift_templates WHERE venue_id = ?', venue.id)).toEqual([])
      const [audit] = rows<{ action: string, target: string, detail: string }>(database,
        'SELECT action, target, detail FROM audit_log WHERE id = ?', entry.id)
      expect(audit).toMatchObject({ action: 'shift-template.removed', target: `venue:${venue.id}` })
      expect(JSON.parse(audit!.detail)).toEqual({ slots: 'BAR:1, DOOR:2, DUTY_MANAGER:1', reason: 'external' })

      const [inUse] = run(database, venueInUseQuery(venue.id)) as { inUse: number }[]
      expect(inUse!.inUse).toBe(0)
    })
  })

  test('a venue still ours keeps its template and nothing is audited', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'still-ours' })
      template(database, venue.id)

      const entry = dropped(venue.id)
      for (const statement of dropExternalTemplateStatements(venue.id, entry)) run(database, statement)

      expect(rows(database, 'SELECT 1 FROM shift_templates WHERE venue_id = ?', venue.id).length).toBe(3)
      expect(rows(database, 'SELECT 1 FROM audit_log WHERE id = ?', entry.id)).toEqual([])
    })
  })

  // The route reads the flag before it writes, so the write carries the predicate too (0003).
  test('a template saved onto a venue marked external since the read writes no row', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'raced-external' })
      external(database, venue.id)
      template(database, venue.id)
      expect(rows(database, 'SELECT 1 FROM shift_templates WHERE venue_id = ?', venue.id)).toEqual([])
    })
  })

  test('an external venue with no template writes no audit entry', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'external-bare' })
      external(database, venue.id)

      const entry = dropped(venue.id)
      for (const statement of dropExternalTemplateStatements(venue.id, entry)) run(database, statement)

      expect(rows(database, 'SELECT 1 FROM audit_log WHERE id = ?', entry.id)).toEqual([])
    })
  })
})

describe('the data migration clears templates already on external venues (E-101 criterion 5)', () => {
  test('an external venue\'s rows go and our own venue\'s stay', async () => {
    await withDatabase(async (database) => {
      const ours = testVenue(database, { suffix: 'migrated-ours' })
      const away = testVenue(database, { suffix: 'migrated-away' })
      template(database, ours.id)
      template(database, away.id)
      external(database, away.id)

      const migration = await Bun.file('server/db/migrations/sqlite/0115_an_external_venue_holds_no_shift_template.sql').text()
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) database.raw.exec(statement.trim())
      }

      expect(rows(database, 'SELECT 1 FROM shift_templates WHERE venue_id = ?', away.id)).toEqual([])
      expect(rows(database, 'SELECT 1 FROM shift_templates WHERE venue_id = ?', ours.id).length).toBe(3)
    })
  })
})

describe('a stale template on an external venue is read by nothing (E-101 criterion 5)', () => {
  test('a venue marked external offers no role to stamp', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'stale' })
      template(database, venue.id)
      expect((run(database, stampableSlotsQuery(venue.id)) as unknown[]).length).toBe(3)

      external(database, venue.id)
      expect(run(database, stampableSlotsQuery(venue.id))).toEqual([])
    })
  })

  test('moving a performance to one does not keep a held shift on the strength of that template', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      template(database, 'venue-b')
      external(database, 'venue-b')
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'DUTY_MANAGER\'',
        who, tonight.performanceId]])

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const dutyManager = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
      expect(dutyManager).toMatchObject({ status: 'CANCELLED', user_id: who })
    })
  })
})

describe('the backfill is idempotent (E-102 criterion 2)', () => {
  test('running it twice creates no duplicate shifts', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)

      const first = run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))
      const second = run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))

      expect(first.length).toBe(4)
      expect(second.length).toBe(0)
      expect(shiftsOn(database, tonight.performanceId).length).toBe(4)
    })
  })

  test('a slot added to the template later is stamped, and the rest are left alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      person(database, 'actor')
      for (const statement of replaceTemplateStatements(tonight.venueId, [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))
      const before = shiftsOn(database, tonight.performanceId)[0]!

      template(database, tonight.venueId)
      run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))

      const after = shiftsOn(database, tonight.performanceId)
      expect(after.length).toBe(4)
      expect(after.find(shift => shift.role === 'DUTY_MANAGER')!.id).toBe(before.id)
    })
  })

  // Editing a template affects only performances stamped afterwards (E-101 criterion 3).
  test('narrowing a template leaves an already stamped rota alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))

      for (const statement of replaceTemplateStatements(tonight.venueId, [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }

      expect(shiftsOn(database, tonight.performanceId).length).toBe(4)
    })
  })

  test('the backfill leaves a night that has already started alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, backfillVenueStatement(tonight.venueId, tonight.startsAt + 1, OFFSETS))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })
})

// Two venues may run at once and one venue may run a matinee and an evening, so a shift belongs
// to exactly one performance and never to a day or a venue (E-127 criterion 1).
describe('a rota belongs to a performance', () => {
  test('a matinee and an evening at one venue each get their own rota', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'a', curtainHoursAfterNightStart: 10.5 })
      const evening = tonightsPerformance(database, {
        suffix: 'b', venueId: matinee.venueId, curtainHoursAfterNightStart: 15.5,
      })
      template(database, matinee.venueId)

      run(database, backfillVenueStatement(matinee.venueId, 0, OFFSETS))

      expect(shiftsOn(database, matinee.performanceId).length).toBe(4)
      expect(shiftsOn(database, evening.performanceId).length).toBe(4)
    })
  })

  test('the same person may hold a shift on both performances of a day', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'a', curtainHoursAfterNightStart: 10.5 })
      const evening = tonightsPerformance(database, {
        suffix: 'b', venueId: matinee.venueId, curtainHoursAfterNightStart: 15.5,
      })
      const who = person(database, 'holder')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-matinee', matinee.performanceId, 'DUTY_MANAGER', who, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-evening', evening.performanceId, 'DUTY_MANAGER', who, 'CONFIRMED'],
      ])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts WHERE user_id = ?', who)[0]!.n).toBe(2)
    })
  })
})

describe('the staffing invariants are the database\'s (E-106 criteria 1 and 4)', () => {
  test('a second confirmed duty manager on one performance fails at the write', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-one', tonight.performanceId, 'DUTY_MANAGER', first, 'CONFIRMED']])

      const refusal = refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-two', tonight.performanceId, 'DUTY_MANAGER', second, 'CONFIRMED'],
      ]))
      expect(refusal?.statusCode).toBe(409)
      expect(refusal?.statusMessage).toContain('confirmed duty manager')
    })
  })

  test('two performances running at once take two confirmed duty managers', async () => {
    await withDatabase(async (database) => {
      const house = tonightsPerformance(database, { suffix: 'a' })
      testVenue(database, { suffix: 'b', name: 'The Studio' })
      const studio = tonightsPerformance(database, { suffix: 'b', venueId: 'venue-b' })
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-house', house.performanceId, 'DUTY_MANAGER', first, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-studio', studio.performanceId, 'DUTY_MANAGER', second, 'CONFIRMED'],
      ])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts WHERE status = \'CONFIRMED\'')[0]!.n).toBe(2)
    })
  })

  test('an unconfirmed duty manager claim does not take the slot', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-one', tonight.performanceId, 'DUTY_MANAGER', first, 'CLAIMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-two', tonight.performanceId, 'DUTY_MANAGER', second, 'CLAIMED'],
      ])

      expect(shiftsOn(database, tonight.performanceId).length).toBe(2)
    })
  })

  test('an open shift cannot name a person (E-106 criterion 2)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')

      const refusal = refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-open', tonight.performanceId, 'DOOR', who, 'OPEN'],
      ]))
      expect(refusal?.statusCode).toBe(409)
      expect(refusal?.statusMessage).toContain('names nobody')
    })
  })

  test('an assigned shift cannot name nobody', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)

      for (const status of ['CLAIMED', 'CONFIRMED', 'DECLINED']) {
        expect(refusalFor(() => database.batch([
          ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, NULL, ?)',
            `shift-${status}`, tonight.performanceId, 'DOOR', status],
        ]))?.statusCode).toBe(409)
      }
    })
  })

  test('a cancelled shift may name somebody or nobody', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-held', tonight.performanceId, 'DOOR', who, 'CANCELLED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, NULL, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'CANCELLED'],
      ])

      expect(shiftsOn(database, tonight.performanceId).length).toBe(2)
    })
  })

  test('one slot is stamped once (E-102 criterion 2)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)

      database.batch([['INSERT INTO shifts (id, performance_id, role, slot) VALUES (?, ?, ?, 1)',
        'shift-one', tonight.performanceId, 'DOOR']])

      expect(refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot) VALUES (?, ?, ?, 1)',
          'shift-two', tonight.performanceId, 'DOOR'],
      ]))?.statusMessage).toContain('already on the rota')
    })
  })
})

describe('cancelling a performance cancels its shifts (E-102 criterion 4)', () => {
  test('every shift on the performance is cancelled, and the holder is kept', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'DUTY_MANAGER\'',
        who, tonight.performanceId]])

      run(database, cancelShiftsStatement(tonight.performanceId))

      const after = shiftsOn(database, tonight.performanceId)
      expect(after.every(shift => shift.status === 'CANCELLED')).toBe(true)
      expect(after.find(shift => shift.role === 'DUTY_MANAGER')!.user_id).toBe(who)
    })
  })

  test('a cancelled performance is not stamped again by a backfill', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      database.batch([['UPDATE performances SET status = \'CANCELLED\' WHERE id = ?', tonight.performanceId]])
      run(database, cancelShiftsStatement(tonight.performanceId))

      run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))

      expect(shiftsOn(database, tonight.performanceId).every(shift => shift.status === 'CANCELLED')).toBe(true)
    })
  })
})

describe('a venue move cancels only a held shift the new house does not staff at all', () => {
  test('a role the new venue still staffs is left alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      template(database, 'venue-b')
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'DUTY_MANAGER\'',
        who, tonight.performanceId]])

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const dutyManager = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
      expect(dutyManager).toMatchObject({ status: 'CONFIRMED', user_id: who })
    })
  })

  test('a role the new venue does not staff at all is cancelled, and the holder is kept', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      for (const statement of replaceTemplateStatements('venue-b', [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'BAR\'',
        who, tonight.performanceId]])

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const bar = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'BAR')
      expect(bar).toMatchObject({ status: 'CANCELLED', user_id: who })
      const dutyManager = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
      expect(dutyManager?.status).toBe('OPEN')
    })
  })

  test('an open shift is untouched: it is restamped away separately, never cancelled', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      for (const statement of replaceTemplateStatements('venue-b', [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const bar = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'BAR')
      expect(bar?.status).toBe('OPEN')
    })
  })
})

// D1 caps a statement at 100 bound parameters, and nothing may bind per row (0003, 0006).
describe('no statement binds per performance or per slot', () => {
  test('stamping a venue binds the same parameters whatever the template holds', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      for (let index = 0; index < 30; index += 1) {
        database.batch([[
          'INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          `performance-${index}`, tonight.showId, tonight.venueId, tonight.startsAt + index * 60, 'ON_SALE',
        ]])
      }

      const [, ...parameters] = boundStatement(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))
      expect(parameters.length).toBeLessThan(MAX_BOUND_PARAMETERS)

      run(database, backfillVenueStatement(tonight.venueId, 0, OFFSETS))
      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts')[0]!.n).toBe(31 * 4)
    })
  })

  test('replacing a template binds per slot and never per venue', async () => {
    await withDatabase(async (database) => {
      const statements = replaceTemplateStatements('venue-a', [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 20 },
        { role: 'BAR', count: 20 },
      ], 'actor')
      for (const statement of statements) {
        expect(boundStatement(database, statement).length - 1).toBeLessThan(MAX_BOUND_PARAMETERS)
      }
      expect(statements.length).toBe(4)
    })
  })
})

describe('a template is replaced whole', () => {
  test('saving over a template leaves exactly what was saved', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      template(database, 'venue-a')

      for (const statement of replaceTemplateStatements('venue-a', [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'BAR', count: 3 },
      ], 'actor')) run(database, statement)

      const held = rows<{ role: string, count: number }>(database,
        'SELECT role, "count" FROM shift_templates WHERE venue_id = ? ORDER BY role', 'venue-a')
      expect(held.map(one => `${one.role}:${one.count}`)).toEqual(['BAR:3', 'DUTY_MANAGER:1'])
    })
  })

  test('the database refuses a second duty manager slot at a venue', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      expect(refusalFor(() => database.batch([
        ['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
          'template-one', 'venue-a', 'DUTY_MANAGER', 2],
      ]))?.statusMessage).toContain('exactly one duty manager')
    })
  })

  test('a venue names each role once', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      database.batch([['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
        'template-one', 'venue-a', 'DOOR', 2]])

      expect(refusalFor(() => database.batch([
        ['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
          'template-two', 'venue-a', 'DOOR', 3],
      ]))?.statusMessage).toContain('each role once')
    })
  })

  test('a shift template goes when its venue does', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      template(database, 'venue-a')
      database.batch([['DELETE FROM venues WHERE id = ?', 'venue-a']])
      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shift_templates')[0]!.n).toBe(0)
    })
  })
})

describe('a shift goes when its performance does', () => {
  test('deleting a performance takes its rota with it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId, OFFSETS))

      database.batch([['DELETE FROM performances WHERE id = ?', tonight.performanceId]])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts')[0]!.n).toBe(0)
    })
  })

  test('a person who has held a shift cannot be deleted out from under it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-one', tonight.performanceId, 'DOOR', who, 'CONFIRMED']])

      expect(() => database.batch([['DELETE FROM users WHERE id = ?', who]])).toThrow()
    })
  })
})

// The open-shift list pages in SQL and returns only what a member could actually claim right now
// (E-103 criterion 5).
describe('the open-shift list (E-103)', () => {
  function stampOpen(database: TestDatabase, performanceId: string, role: string, slot: number, status = 'OPEN', userId: string | null = null): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      `${performanceId}-${role}-${slot}`, performanceId, role, slot, userId, status]])
  }

  test('lists only OPEN shifts on performances that are not cancelled and have not started', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      stampOpen(database, tonight.performanceId, 'DOOR', 1)
      stampOpen(database, tonight.performanceId, 'BAR', 1, 'CLAIMED', person(database, 'holder'))

      const past = tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: -100 })
      stampOpen(database, past.performanceId, 'DOOR', 1)

      const cancelled = tonightsPerformance(database, { suffix: 'c', status: 'CANCELLED' })
      stampOpen(database, cancelled.performanceId, 'DOOR', 1)

      const now = tonight.startsAt - 3600
      const items = rows<OpenShiftRow>(database, ...boundStatement(database, openShiftsQuery({}, now, 25, 0)))
      expect(items.map(item => item.shiftId)).toEqual([`${tonight.performanceId}-DOOR-1`])

      const [total] = rows<{ total: number }>(database, ...boundStatement(database, countOpenShiftsQuery({}, now)))
      expect(total?.total).toBe(1)
    })
  })

  test('a role filter narrows both the list and the count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      stampOpen(database, tonight.performanceId, 'DOOR', 1)
      stampOpen(database, tonight.performanceId, 'BAR', 1)

      const now = tonight.startsAt - 3600
      const items = rows<OpenShiftRow>(database, ...boundStatement(database, openShiftsQuery({ role: 'BAR' }, now, 25, 0)))
      expect(items.map(item => item.role)).toEqual(['BAR'])

      const [total] = rows<{ total: number }>(database, ...boundStatement(database, countOpenShiftsQuery({ role: 'BAR' }, now)))
      expect(total?.total).toBe(1)
    })
  })

  test('a date range excludes a shift on a performance outside it', async () => {
    await withDatabase(async (database) => {
      const near = tonightsPerformance(database, { suffix: 'a' })
      const far = tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: 15.5 + 30 * 24 })
      stampOpen(database, near.performanceId, 'DOOR', 1)
      stampOpen(database, far.performanceId, 'DOOR', 1)

      const now = near.startsAt - 3600
      const items = rows<OpenShiftRow>(database, ...boundStatement(database,
        openShiftsQuery({ to: near.startsAt + 3600 }, now, 25, 0)))
      expect(items.map(item => item.shiftId)).toEqual([`${near.performanceId}-DOOR-1`])
    })
  })

  test('the page size limits what comes back, and the offset moves the window', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      for (let slot = 1; slot <= 5; slot += 1) stampOpen(database, tonight.performanceId, 'DOOR', slot)

      const now = tonight.startsAt - 3600
      const firstPage = rows<OpenShiftRow>(database, ...boundStatement(database, openShiftsQuery({}, now, 2, 0)))
      const secondPage = rows<OpenShiftRow>(database, ...boundStatement(database, openShiftsQuery({}, now, 2, 2)))
      expect(firstPage.length).toBe(2)
      expect(secondPage.length).toBe(2)
      expect(firstPage.map(item => item.shiftId)).not.toEqual(secondPage.map(item => item.shiftId))
    })
  })

  // Nothing here may bind per shift or per performance, whatever the page holds (0003, 0006).
  test('the bound parameter count does not grow with how many shifts are open', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      for (let slot = 1; slot <= 40; slot += 1) stampOpen(database, tonight.performanceId, 'DOOR', slot)

      const now = tonight.startsAt - 3600
      const [, ...listParameters] = boundStatement(database, openShiftsQuery({ role: 'DOOR', to: now + 100_000 }, now, 25, 0))
      const [, ...countParameters] = boundStatement(database, countOpenShiftsQuery({ role: 'DOOR', to: now + 100_000 }, now))
      expect(listParameters.length).toBeLessThan(MAX_BOUND_PARAMETERS)
      expect(countParameters.length).toBeLessThan(MAX_BOUND_PARAMETERS)
    })
  })
})

describe('a member\'s own shifts (E-103)', () => {
  test('only that member\'s upcoming, non-cancelled shifts come back, soonest first', async () => {
    await withDatabase(async (database) => {
      const mine = tonightsPerformance(database, { suffix: 'a' })
      const later = tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: 15.5 + 24 })
      const who = person(database, 'holder')
      const someoneElse = person(database, 'other')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-later', later.performanceId, 'DOOR', who, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-mine', mine.performanceId, 'DUTY_MANAGER', who, 'CLAIMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-other', mine.performanceId, 'DOOR', someoneElse, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 3, ?, ?)',
          'shift-cancelled', mine.performanceId, 'BAR', who, 'CANCELLED'],
      ])

      const now = mine.startsAt - 3600
      const items = rows<{ shiftId: string }>(database, ...boundStatement(database, myShiftsQuery(who, now)))
      expect(items.map(item => item.shiftId)).toEqual(['shift-mine', 'shift-later'])
    })
  })
})

describe('claiming an open shift (E-104)', () => {
  test('an open shift is claimed for the caller, whatever status E-105 wrote', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])

      const claimed = run(database, claimShiftStatement('shift-open', who, 'CLAIMED'))
      expect(claimed).toHaveLength(1)

      const shift = shiftsOn(database, tonight.performanceId)[0]!
      expect(shift).toMatchObject({ user_id: who, status: 'CLAIMED' })
    })
  })

  test('auto-confirm writes CONFIRMED and its timestamp directly', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])

      run(database, claimShiftStatement('shift-open', who, 'CONFIRMED'))

      const shift = rows<{ status: string, confirmed_at: number | null }>(database,
        'SELECT status, confirmed_at FROM shifts WHERE id = ?', 'shift-open')[0]!
      expect(shift.status).toBe('CONFIRMED')
      expect(shift.confirmed_at).not.toBeNull()
    })
  })

  test('a shift already taken matches nothing (criterion 2)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-taken', tonight.performanceId, 'DOOR', first, 'CONFIRMED']])

      expect(run(database, claimShiftStatement('shift-taken', second, 'CONFIRMED'))).toHaveLength(0)
    })
  })

  test('a member already holding a shift on the performance cannot claim a second (criterion 3)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-held', tonight.performanceId, 'BAR', who, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 2, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'OPEN'],
      ])

      expect(run(database, claimShiftStatement('shift-open', who, 'CONFIRMED'))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId).find(shift => shift.id === 'shift-open')!.status).toBe('OPEN')
    })
  })

  test('the same person may still hold shifts on two different performances', async () => {
    await withDatabase(async (database) => {
      const first = tonightsPerformance(database, { suffix: 'a' })
      const second = tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: 15.5 + 24 })
      const who = person(database, 'holder')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-a', first.performanceId, 'BAR', who, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
          'shift-b', second.performanceId, 'DOOR', 'OPEN'],
      ])

      expect(run(database, claimShiftStatement('shift-b', who, 'CONFIRMED'))).toHaveLength(1)
    })
  })

  test('a declined shift is not open and cannot be claimed straight through', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-declined', tonight.performanceId, 'DOOR', first, 'DECLINED']])

      expect(run(database, claimShiftStatement('shift-declined', second, 'CONFIRMED'))).toHaveLength(0)
    })
  })
})

// The claim's own training gate, as the approval route hands it to the write (E-105 criterion 3).
const TODAY = '2026-10-12'
const GATE = { moduleId: 'SFTY-001', today: TODAY }

function trained(database: TestDatabase, userId: string, record: { id?: string, expiresOn?: string | null, revoked?: boolean } = {}): void {
  database.batch([
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'SFTY', 'Safety'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'SFTY-001', 'SFTY', 'MODULE', 'First Aid'],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source, revoked_at)
      VALUES (?, ?, ?, '2025-08-21', ?, 'SIGNOFF', ?)`,
    record.id ?? `tr-${userId}`, userId, 'SFTY-001', record.expiresOn ?? null, record.revoked ? 1_760_000_000 : null],
  ])
}

describe('answering a queued claim (E-105)', () => {
  test('approving a claimed shift confirms it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      trained(database, who)
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, approveShiftStatement('shift-queued', GATE))).toHaveLength(1)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'CONFIRMED', user_id: who })
    })
  })

  test('approving twice matches nothing the second time', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      trained(database, who)
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      run(database, approveShiftStatement('shift-queued', GATE))
      expect(run(database, approveShiftStatement('shift-queued', GATE))).toHaveLength(0)
    })
  })

  test('a second confirmed duty manager still fails at the write when approved (E-106 criterion 1)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')
      trained(database, second)
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-a', tonight.performanceId, 'DUTY_MANAGER', first, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-b', tonight.performanceId, 'DUTY_MANAGER', second, 'CLAIMED'],
      ])

      const refusal = refusalFor(() => run(database, approveShiftStatement('shift-b', GATE)))
      expect(refusal?.statusCode).toBe(409)
      expect(refusal?.statusMessage).toContain('confirmed duty manager')
    })
  })

  test('declining a claimed shift records the reason and takes the person off it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, declineShiftStatement('shift-queued', 'Already rostered elsewhere'))).toHaveLength(1)

      const shift = rows<{ status: string, user_id: string, decline_reason: string | null }>(database,
        'SELECT status, user_id, decline_reason FROM shifts WHERE id = ?', 'shift-queued')[0]!
      expect(shift).toMatchObject({ status: 'DECLINED', user_id: who, decline_reason: 'Already rostered elsewhere' })
    })
  })

  test('a claimant whose training has since expired is not confirmed, and stays claimed (#1302)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      trained(database, who, { expiresOn: '2026-08-21' })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, approveShiftStatement('shift-queued', GATE))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'CLAIMED', user_id: who, confirmed_at: null })
    })
  })

  test('a record expiring today no longer counts; one expiring tomorrow still does (G-101 criterion 3)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const lapsing = person(database, 'lapsing')
      const expiring = person(database, 'expiring')
      trained(database, lapsing, { expiresOn: TODAY })
      trained(database, expiring, { expiresOn: '2026-10-13' })
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-lapsing', tonight.performanceId, 'DOOR', lapsing, 'CLAIMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-expiring', tonight.performanceId, 'DOOR', expiring, 'CLAIMED'],
      ])

      expect(run(database, approveShiftStatement('shift-lapsing', GATE))).toHaveLength(0)
      expect(run(database, approveShiftStatement('shift-expiring', GATE))).toHaveLength(1)
    })
  })

  test('a revoked record is not confirmed, and a current one beside it is (#1302)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const revoked = person(database, 'revoked')
      const renewed = person(database, 'renewed')
      trained(database, revoked, { revoked: true })
      trained(database, renewed, { id: 'tr-renewed-old', revoked: true })
      trained(database, renewed, { id: 'tr-renewed-new' })
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-revoked', tonight.performanceId, 'DOOR', revoked, 'CLAIMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-renewed', tonight.performanceId, 'DOOR', renewed, 'CLAIMED'],
      ])

      expect(run(database, approveShiftStatement('shift-revoked', GATE))).toHaveLength(0)
      expect(run(database, approveShiftStatement('shift-renewed', GATE))).toHaveLength(1)
    })
  })

  test('the check reads the claimant, never whoever else holds the module (#1302)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      trained(database, person(database, 'someone-else'))
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, approveShiftStatement('shift-queued', GATE))).toHaveLength(0)
    })
  })

  test('an unset rule confirms nobody, as it lets nobody claim (E-103 criterion 4)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      trained(database, who)
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, approveShiftStatement('shift-queued', { moduleId: null, today: TODAY }))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'CLAIMED' })
    })
  })

  test('approving binds a fixed three parameters, whoever claimed (0006)', async () => {
    await withDatabase(async (database) => {
      const [, ...parameters] = boundStatement(database, approveShiftStatement('shift-queued', GATE))
      expect(parameters).toHaveLength(3)
    })
  })

  test('declining an already-settled claim matches nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-confirmed', tonight.performanceId, 'DOOR', who, 'CONFIRMED']])

      expect(run(database, declineShiftStatement('shift-confirmed', 'Too late'))).toHaveLength(0)
    })
  })
})

describe('releasing a held shift (E-107 criterion 1)', () => {
  test('a confirmed shift returns to open, naming nobody', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status, claimed_at, confirmed_at) VALUES (?, ?, ?, 1, ?, ?, unixepoch(), unixepoch())',
        'shift-held', tonight.performanceId, 'DOOR', who, 'CONFIRMED']])

      expect(run(database, releaseShiftStatement('shift-held', who))).toHaveLength(1)

      const shift = rows<{ status: string, user_id: string | null, claimed_at: number | null, confirmed_at: number | null }>(database,
        'SELECT status, user_id, claimed_at, confirmed_at FROM shifts WHERE id = ?', 'shift-held')[0]!
      expect(shift).toMatchObject({ status: 'OPEN', user_id: null, claimed_at: null, confirmed_at: null })
    })
  })

  test('a claimed (unconfirmed) shift releases the same way', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-claimed', tonight.performanceId, 'DOOR', who, 'CLAIMED']])

      expect(run(database, releaseShiftStatement('shift-claimed', who))).toHaveLength(1)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'OPEN', user_id: null })
    })
  })

  test('somebody else releasing the shift matches nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      const other = person(database, 'other')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-held', tonight.performanceId, 'DOOR', holder, 'CONFIRMED']])

      expect(run(database, releaseShiftStatement('shift-held', other))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'CONFIRMED', user_id: holder })
    })
  })

  test('an open or declined shift has nothing to release', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'somebody')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'OPEN'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-declined', tonight.performanceId, 'BAR', who, 'DECLINED'],
      ])

      expect(run(database, releaseShiftStatement('shift-open', who))).toHaveLength(0)
      expect(run(database, releaseShiftStatement('shift-declined', who))).toHaveLength(0)
    })
  })
})

describe('dismissing a declined claim (E-114)', () => {
  test('a declined claim returns to OPEN, naming nobody, exactly as a release would', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'declined')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status, decline_reason) VALUES (?, ?, ?, 1, ?, ?, ?)',
        'shift-declined', tonight.performanceId, 'DOOR', who, 'DECLINED', 'Not eligible']])

      expect(run(database, dismissShiftStatement('shift-declined', who))).toHaveLength(1)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({
        status: 'OPEN', user_id: null, claimed_at: null, confirmed_at: null, decline_reason: null,
      })
    })
  })

  test('the position stays fillable: an officer can assign it after the member dismisses it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const who = person(database, 'declined')
      const other = person(database, 'other')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status, decline_reason) VALUES (?, ?, ?, 1, ?, ?, ?)',
        'shift-declined', tonight.performanceId, 'DOOR', who, 'DECLINED', 'Not eligible']])

      expect(run(database, dismissShiftStatement('shift-declined', who))).toHaveLength(1)
      expect(run(database, assignShiftStatement('shift-declined', other, officer))).toHaveLength(1)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'CONFIRMED', user_id: other })
    })
  })

  test('somebody else dismissing it matches nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      const other = person(database, 'other')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-declined', tonight.performanceId, 'DOOR', holder, 'DECLINED']])

      expect(run(database, dismissShiftStatement('shift-declined', other))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId)[0]).toMatchObject({ status: 'DECLINED', user_id: holder })
    })
  })

  test('an open, claimed or confirmed shift has nothing to dismiss this way', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'somebody')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'OPEN'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-confirmed', tonight.performanceId, 'BAR', who, 'CONFIRMED'],
      ])

      expect(run(database, dismissShiftStatement('shift-open', who))).toHaveLength(0)
      expect(run(database, dismissShiftStatement('shift-confirmed', who))).toHaveLength(0)
    })
  })
})

describe('an officer assigning or reassigning a shift (E-107 criteria 3 and 4)', () => {
  test('assigning fills an open shift, confirmed by definition', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const member = person(database, 'member')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-open', tonight.performanceId, 'DOOR', 'OPEN']])

      expect(run(database, assignShiftStatement('shift-open', member, officer))).toHaveLength(1)

      const shift = rows<{ status: string, user_id: string, assigned_by: string, confirmed_at: number | null }>(database,
        'SELECT status, user_id, assigned_by, confirmed_at FROM shifts WHERE id = ?', 'shift-open')[0]!
      expect(shift).toMatchObject({ status: 'CONFIRMED', user_id: member, assigned_by: officer })
      expect(shift.confirmed_at).not.toBeNull()
    })
  })

  test('assigning replaces a declined shift\'s decline reason with nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const previous = person(database, 'previous')
      const member = person(database, 'member')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status, decline_reason) VALUES (?, ?, ?, 1, ?, ?, ?)',
        'shift-declined', tonight.performanceId, 'DOOR', previous, 'DECLINED', 'Double-booked']])

      expect(run(database, assignShiftStatement('shift-declined', member, officer))).toHaveLength(1)

      const shift = rows<{ status: string, user_id: string, decline_reason: string | null }>(database,
        'SELECT status, user_id, decline_reason FROM shifts WHERE id = ?', 'shift-declined')[0]!
      expect(shift).toMatchObject({ status: 'CONFIRMED', user_id: member, decline_reason: null })
    })
  })

  // One UPDATE on the row that already exists: the partial unique index never has to arbitrate
  // between two CONFIRMED duty managers, because there was only ever the one row (criterion 4).
  test('replacing a confirmed duty manager is one write and never trips the one-per-performance index', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const outgoing = person(database, 'outgoing')
      const incoming = person(database, 'incoming')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-dm', tonight.performanceId, 'DUTY_MANAGER', outgoing, 'CONFIRMED']])

      expect(run(database, assignShiftStatement('shift-dm', incoming, officer))).toHaveLength(1)

      const rowsFound = rows<{ user_id: string, status: string }>(database,
        `SELECT user_id, status FROM shifts WHERE performance_id = ? AND role = 'DUTY_MANAGER' AND status = 'CONFIRMED'`,
        tonight.performanceId)
      expect(rowsFound).toEqual([{ user_id: incoming, status: 'CONFIRMED' }])
    })
  })

  test('assigning onto a cancelled shift matches nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const member = person(database, 'member')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)',
        'shift-cancelled', tonight.performanceId, 'DOOR', 'CANCELLED']])

      expect(run(database, assignShiftStatement('shift-cancelled', member, officer))).toHaveLength(0)
    })
  })

  test('a member already committed elsewhere on the performance cannot be assigned a second shift', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const member = person(database, 'member')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-held', tonight.performanceId, 'BAR', member, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 2, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'OPEN'],
      ])

      expect(run(database, assignShiftStatement('shift-open', member, officer))).toHaveLength(0)
      expect(shiftsOn(database, tonight.performanceId).find(shift => shift.id === 'shift-open')!.status).toBe('OPEN')
    })
  })

  test('reassigning a shift to the member who already holds it is not blocked by its own row', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      const member = person(database, 'member')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-held', tonight.performanceId, 'DOOR', member, 'CLAIMED']])

      expect(run(database, assignShiftStatement('shift-held', member, officer))).toHaveLength(1)
    })
  })
})

// What show-night authority's SHIFT branch resolves against: disabled and anonymised are
// re-checked at the query, not trusted from the shift row (0009, the coordinator's review).
describe('a confirmed shift resolves authority only for a current account', () => {
  const bounds = showNightBounds(currentShowNight())
  const from = Math.floor(bounds.from.getTime() / 1000)
  const to = Math.floor(bounds.to.getTime() / 1000)

  function confirmedShift(database: TestDatabase, performanceId: string, role: string, userId: string): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      `${performanceId}-${role}`, performanceId, role, userId, 'CONFIRMED']])
  }

  test('an ordinary confirmed shift resolves', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      confirmedShift(database, tonight.performanceId, 'DOOR', holder)

      const resolved = run(database, confirmedShiftsTonightQuery(holder, 'DOOR', from, to, {}))
      expect(resolved).toHaveLength(1)
    })
  })

  test('a disabled holder resolves nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', holder]])
      confirmedShift(database, tonight.performanceId, 'DOOR', holder)

      const resolved = run(database, confirmedShiftsTonightQuery(holder, 'DOOR', from, to, {}))
      expect(resolved).toHaveLength(0)
    })
  })

  test('an anonymised holder resolves nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      database.batch([['UPDATE users SET anonymised_at = unixepoch() WHERE id = ?', holder]])
      confirmedShift(database, tonight.performanceId, 'DOOR', holder)

      const resolved = run(database, confirmedShiftsTonightQuery(holder, 'DOOR', from, to, {}))
      expect(resolved).toHaveLength(0)
    })
  })
})

// The viewer fact the account menu's Tonight entry is gated on (#1039, 0040). Confirmed only,
// unlike My NNT's accent tile, which counts a claim still waiting on approval (0009, 0044).
describe('onShiftTonight is a confirmed shift inside tonight, and nothing else', () => {
  const bounds = showNightBounds(currentShowNight())
  const from = Math.floor(bounds.from.getTime() / 1000)
  const to = Math.floor(bounds.to.getTime() / 1000)

  function shift(database: TestDatabase, performanceId: string, userId: string, status: string): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      `${performanceId}-shift`, performanceId, 'DOOR', userId, status]])
  }

  function onShift(database: TestDatabase, userId: string): boolean {
    const [row] = run(database, onShiftTonightQuery(userId, from, to)) as { n: number }[]
    return (row?.n ?? 0) > 0
  }

  test('a confirmed shift tonight reads true', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      shift(database, tonight.performanceId, holder, 'CONFIRMED')

      expect(onShift(database, holder)).toBe(true)
    })
  })

  test('a claim still waiting on approval reads false', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'holder')
      shift(database, tonight.performanceId, holder, 'CLAIMED')

      expect(onShift(database, holder)).toBe(false)
    })
  })

  test('a confirmed shift on a cancelled performance reads false', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database, { status: 'CANCELLED' })
      const holder = person(database, 'holder')
      shift(database, tonight.performanceId, holder, 'CONFIRMED')

      expect(onShift(database, holder)).toBe(false)
    })
  })

  test('a confirmed shift tomorrow night reads false', async () => {
    await withDatabase(async (database) => {
      const tomorrow = tonightsPerformance(database, { night: daysAfter(currentShowNight(), 1), suffix: 'b' })
      const holder = person(database, 'holder')
      shift(database, tomorrow.performanceId, holder, 'CONFIRMED')

      expect(onShift(database, holder)).toBe(false)
    })
  })

  // 01:00 belongs to the evening that began at 04:00 the day before, so a late finish is still
  // tonight's work rather than tomorrow's (0014).
  test('a confirmed shift on a performance starting at 01:00 reads true', async () => {
    await withDatabase(async (database) => {
      const HOURS_TO_ONE_AM = 21
      const late = tonightsPerformance(database, { curtainHoursAfterNightStart: HOURS_TO_ONE_AM })
      const holder = person(database, 'holder')
      shift(database, late.performanceId, holder, 'CONFIRMED')

      expect(onShift(database, holder)).toBe(true)
    })
  })
})

// A venue's first template left the imported diary unstamped until somebody found "Stamp the
// diary"; saving one now stamps what was never stamped, and nothing else (issue 1319, E-101 criterion 3).
describe('saving a template stamps the future performances never stamped before (issue 1319)', () => {
  const fromTonight = (): number => Math.floor(showNightBounds(currentShowNight()).from.getTime() / 1000)

  test('a never-stamped performance is stamped; one holding any shift and one already past are left alone', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      const bare = tonightsPerformance(database, { suffix: 'bare', night: daysAfter(currentShowNight(), 3), venueId: 'venue-a' })
      const held = tonightsPerformance(database, { suffix: 'held', night: daysAfter(currentShowNight(), 4), venueId: 'venue-a' })
      const past = tonightsPerformance(database, { suffix: 'past', night: daysAfter(currentShowNight(), -2), venueId: 'venue-a' })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'held-door', held.performanceId, 'DOOR', 1, 'OPEN']])
      template(database, 'venue-a')

      run(database, stampUnstampedStatement('venue-a', fromTonight(), OFFSETS))

      expect(shiftsOn(database, bare.performanceId).map(one => `${one.role}:${one.slot}:${one.status}`)).toEqual([
        'BAR:1:OPEN', 'DOOR:1:OPEN', 'DOOR:2:OPEN', 'DUTY_MANAGER:1:OPEN',
      ])
      expect(shiftsOn(database, held.performanceId).map(one => one.id)).toEqual(['held-door'])
      expect(shiftsOn(database, past.performanceId)).toEqual([])
    })
  })

  // A performance moved here from another venue keeps only the cancelled shifts the move left, and
  // the board shows it as nobody rostered, so the save reaches it (issue 1319).
  test('a performance holding only cancelled shifts is stamped, around the slot a cancelled row still holds', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      const moved = tonightsPerformance(database, { suffix: 'moved', night: daysAfter(currentShowNight(), 3), venueId: 'venue-a' })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'gone-bar', moved.performanceId, 'BAR', 1, 'CANCELLED']])
      template(database, 'venue-a')

      run(database, stampUnstampedStatement('venue-a', fromTonight(), OFFSETS))

      expect(shiftsOn(database, moved.performanceId).map(one => `${one.role}:${one.slot}:${one.status}`)).toEqual([
        'BAR:1:CANCELLED', 'DOOR:1:OPEN', 'DOOR:2:OPEN', 'DUTY_MANAGER:1:OPEN',
      ])
    })
  })

  test('another venue\'s performance is untouched, and the statement binds only the venue and the night', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      testVenue(database, { suffix: 'b' })
      const elsewhere = tonightsPerformance(database, { suffix: 'elsewhere', night: daysAfter(currentShowNight(), 3), venueId: 'venue-b' })
      template(database, 'venue-a')
      template(database, 'venue-b')

      const statement = stampUnstampedStatement('venue-a', fromTonight(), OFFSETS)
      run(database, statement)
      expect(shiftsOn(database, elsewhere.performanceId)).toEqual([])
      expect(boundStatement(database, statement).length - 1).toBeLessThan(MAX_BOUND_PARAMETERS)
    })
  })
})

// An external night nobody rostered is not a gap to chase every morning; one of ours still is
// (issue 1319, E-108 criterion 1, E-101 criterion 4).
describe('the unstaffed digest leaves out an external night with no shifts (issue 1319)', () => {
  test('ours with no shifts and an external night with an open shift are chased; an external night with none is not', async () => {
    await withDatabase(async (database) => {
      const soon = daysAfter(currentShowNight(), 3)
      testVenue(database, { suffix: 'a' })
      testVenue(database, { suffix: 'away', isExternal: true })
      const ours = tonightsPerformance(database, { suffix: 'ours', night: soon, venueId: 'venue-a' })
      const bare = tonightsPerformance(database, { suffix: 'bare', night: soon, venueId: 'venue-away' })
      const adHoc = tonightsPerformance(database, { suffix: 'adhoc', night: soon, venueId: 'venue-away' })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'adhoc-dm', adHoc.performanceId, 'DUTY_MANAGER', 1, 'OPEN']])

      const from = Math.floor(Date.now() / 1000)
      const chased = (run(database, unstaffedPerformancesQuery(from, from + 7 * 86_400)) as { performanceId: string }[])
        .map(row => row.performanceId)
      expect(chased).toContain(ours.performanceId)
      expect(chased).toContain(adHoc.performanceId)
      expect(chased).not.toContain(bare.performanceId)
    })
  })
})
