import { describe, expect, test } from 'bun:test'
import {
  backfillShiftTimesStatement,
  backfillVenueStatement,
  replaceTemplateStatements,
  stampPerformanceStatement,
} from '#server/utils/rota'
import { shiftWindow } from '#shared/utils/rota-times'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A shift's own start and end, stamped from the performance and the venue's template (E-131,
// 0078). The SQL and `shiftWindow()` compute the same window, which is what these compare.

const DEFAULTS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

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

function person(database: TestDatabase, id = 'actor'): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

interface TimedShift { role: string, slot: number, starts_at: number | null, ends_at: number | null }

function timesOn(database: TestDatabase, performanceId: string): TimedShift[] {
  return rows<TimedShift>(database,
    'SELECT role, slot, starts_at, ends_at FROM shifts WHERE performance_id = ? ORDER BY role, slot',
    performanceId)
}

interface TemplateSlotInput { role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', count: number, startsBeforeDoorsMinutes?: number | null, endsAfterEndMinutes?: number | null }

function template(database: TestDatabase, venueId: string, slots: TemplateSlotInput[]): void {
  const actorId = person(database)
  for (const statement of replaceTemplateStatements(venueId, slots, actorId)) run(database, statement)
}

const HOUSE: TemplateSlotInput[] = [
  { role: 'DUTY_MANAGER', count: 1 },
  { role: 'DOOR', count: 1 },
  { role: 'BAR', count: 1 },
]

describe('stamping computes a shift window (E-131 criterion 1)', () => {
  test('every stamped shift carries the default window, and it agrees with shiftWindow()', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, HOUSE)

      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))

      const expected = shiftWindow(
        { startsAt: tonight.startsAt, doorsAt: tonight.startsAt - 1800, durationMinutes: 120 },
        DEFAULTS,
      )
      const stamped = timesOn(database, tonight.performanceId)
      expect(stamped.length).toBe(3)
      expect(stamped.every(shift => shift.starts_at === expected.startsAt)).toBe(true)
      expect(stamped.every(shift => shift.ends_at === expected.endsAt)).toBe(true)
    })
  })

  test('the curtain stands in for a performance with no doors time and no running time', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      database.batch([['UPDATE performances SET doors_at = NULL, duration_minutes = NULL WHERE id = ?', tonight.performanceId]])
      template(database, tonight.venueId, HOUSE)

      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))

      const [shift] = timesOn(database, tonight.performanceId)
      expect(shift!.starts_at).toBe(tonight.startsAt - 30 * 60)
      expect(shift!.ends_at).toBe(tonight.startsAt + 30 * 60)
    })
  })

  test('intervals extend the end of the window', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      database.batch([['UPDATE performances SET interval_count = 1, interval_minutes = 20 WHERE id = ?', tonight.performanceId]])
      template(database, tonight.venueId, HOUSE)

      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))

      const [shift] = timesOn(database, tonight.performanceId)
      expect(shift!.ends_at).toBe(tonight.startsAt + (120 + 20 + 30) * 60)
    })
  })
})

describe('a venue template overrides the offsets per role (E-131 criterion 2)', () => {
  test('the bar opens earlier and closes later than the door, on one performance', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 1 },
        { role: 'BAR', count: 1, startsBeforeDoorsMinutes: 60, endsAfterEndMinutes: 90 },
      ])

      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))

      const stamped = timesOn(database, tonight.performanceId)
      const bar = stamped.find(shift => shift.role === 'BAR')!
      const door = stamped.find(shift => shift.role === 'DOOR')!
      expect(bar.starts_at).toBe(tonight.startsAt - 1800 - 60 * 60)
      expect(bar.ends_at).toBe(tonight.startsAt + (120 + 90) * 60)
      expect(door.starts_at).toBe(tonight.startsAt - 1800 - 30 * 60)
      expect(door.ends_at).toBe(tonight.startsAt + (120 + 30) * 60)
    })
  })

  test('a template row with null offsets takes the configured default', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'BAR', count: 1, startsBeforeDoorsMinutes: null, endsAfterEndMinutes: null },
      ])

      run(database, stampPerformanceStatement(tonight.performanceId, { startBeforeDoorsMinutes: 45, endAfterEndMinutes: 15 }))

      const [shift] = timesOn(database, tonight.performanceId)
      expect(shift!.starts_at).toBe(tonight.startsAt - 1800 - 45 * 60)
      expect(shift!.ends_at).toBe(tonight.startsAt + (120 + 15) * 60)
    })
  })

  test('editing the template afterwards changes nothing already stamped (E-131 criterion 3)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, HOUSE)
      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))
      const before = timesOn(database, tonight.performanceId)

      template(database, tonight.venueId, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 1, startsBeforeDoorsMinutes: 120 },
        { role: 'BAR', count: 1, startsBeforeDoorsMinutes: 120 },
      ])

      expect(timesOn(database, tonight.performanceId)).toEqual(before)
    })
  })
})

describe('the backfill fills what is null and nothing else (E-131 criterion 3)', () => {
  test('a shift stamped before the columns existed is filled, and a second run writes nothing', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, HOUSE)
      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))
      database.batch([['UPDATE shifts SET starts_at = NULL, ends_at = NULL WHERE performance_id = ?', tonight.performanceId]])

      const first = run(database, backfillShiftTimesStatement(DEFAULTS))
      const second = run(database, backfillShiftTimesStatement(DEFAULTS))

      expect(first.length).toBe(3)
      expect(second.length).toBe(0)
      const expected = shiftWindow({ startsAt: tonight.startsAt, doorsAt: tonight.startsAt - 1800, durationMinutes: 120 }, DEFAULTS)
      expect(timesOn(database, tonight.performanceId).every(shift => shift.starts_at === expected.startsAt)).toBe(true)
    })
  })

  test('a window already stamped is left alone, whatever the current defaults say', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, HOUSE)
      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))
      const before = timesOn(database, tonight.performanceId)

      run(database, backfillShiftTimesStatement({ startBeforeDoorsMinutes: 240, endAfterEndMinutes: 240 }))

      expect(timesOn(database, tonight.performanceId)).toEqual(before)
    })
  })
})

describe('the statements bind a fixed number of parameters (0003, 0006)', () => {
  test('stamping and backfilling bind the two defaults, however many slots the template holds', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 20 },
        { role: 'BAR', count: 20 },
      ])

      for (const statement of [
        stampPerformanceStatement(tonight.performanceId, DEFAULTS),
        backfillVenueStatement(tonight.venueId, 0, DEFAULTS),
        backfillShiftTimesStatement(DEFAULTS),
      ]) {
        expect(boundStatement(database, statement).length - 1).toBeLessThan(MAX_BOUND_PARAMETERS)
      }

      run(database, stampPerformanceStatement(tonight.performanceId, DEFAULTS))
      expect(timesOn(database, tonight.performanceId).length).toBe(41)
    })
  })
})
