import { describe, expect, test } from 'bun:test'
import {
  addShiftStatement,
  assignShiftStatement,
  backfillVenueStatement,
  claimShiftStatement,
  moveOffStatement,
  openShiftsQuery,
  otherShiftHeldQuery,
  shiftGate,
} from '#server/utils/rota'
import { sql } from 'drizzle-orm'
import { showNightOf } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Decision 0211 against the real migrations: one person is in one building at a time, a draft
// show offers no shifts, a performance already over is not stamped, and a move is one write.

const NOW = Math.floor(Date.now() / 1000)
const TODAY = '2026-10-12'
const MODULE = 'ADMN-103'
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }
const NEXT_WEEK = showNightOf(new Date(Date.now() + 7 * 86_400_000))
const gate = shiftGate('DOOR', MODULE, TODAY, NOW)

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

function trained(database: TestDatabase, id: string): string {
  database.batch([
    ['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, `Someone ${id}`, `${id}@example.invalid`],
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', MODULE, 'ADMN', 'MODULE', 'Box Office'],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, '2026-08-21', 'SIGNOFF')`, `tr-${id}`, id, MODULE],
  ])
  return id
}

// A door shift with the window a stamp would give it, from 30 minutes before curtain for two hours.
function shift(database: TestDatabase, id: string, performanceId: string, startsAt: number, holder?: string, role = 'DOOR', slot = 1): string {
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, performanceId, role, slot, holder ?? null, holder ? 'CONFIRMED' : 'OPEN', startsAt - 1800, startsAt + 5400]])
  return id
}

const statusOf = (database: TestDatabase, id: string): { status: string, user_id: string | null } =>
  rows<{ status: string, user_id: string | null }>(database, 'SELECT status, user_id FROM shifts WHERE id = ?', id)[0]!

// Two venues on one night, an hour apart, so their windows overlap.
function twoVenues(database: TestDatabase) {
  const here = tonightsPerformance(database, { suffix: 'a', night: NEXT_WEEK, curtainHoursAfterNightStart: 15.5 })
  const there = tonightsPerformance(database, { suffix: 'b', night: NEXT_WEEK, curtainHoursAfterNightStart: 16.5 })
  return { here, there }
}

describe('one person, one building at a time (0211)', () => {
  test('a claim overlapping a shift held at another venue is refused', async () => {
    await withDatabase((database) => {
      const { here, there } = twoVenues(database)
      const member = trained(database, 'member')
      shift(database, 'held', here.performanceId, here.startsAt, member)
      const open = shift(database, 'open', there.performanceId, there.startsAt)

      expect(run(database, claimShiftStatement(open, member, 'CONFIRMED', gate))).toHaveLength(0)
    })
  })

  test('the same claim with no overlap goes through', async () => {
    await withDatabase((database) => {
      const here = tonightsPerformance(database, { suffix: 'a', night: NEXT_WEEK, curtainHoursAfterNightStart: 10 })
      const there = tonightsPerformance(database, { suffix: 'b', night: NEXT_WEEK, curtainHoursAfterNightStart: 16 })
      const member = trained(database, 'member')
      shift(database, 'held', here.performanceId, here.startsAt, member)
      const open = shift(database, 'open', there.performanceId, there.startsAt)

      expect(run(database, claimShiftStatement(open, member, 'CONFIRMED', gate))).toHaveLength(1)
    })
  })

  test('two performances at the same venue are not a clash', async () => {
    await withDatabase((database) => {
      const here = tonightsPerformance(database, { suffix: 'a', night: NEXT_WEEK, curtainHoursAfterNightStart: 15.5 })
      const again = tonightsPerformance(database, { suffix: 'b', night: NEXT_WEEK, venueId: here.venueId, curtainHoursAfterNightStart: 16 })
      const member = trained(database, 'member')
      shift(database, 'held', here.performanceId, here.startsAt, member)
      const open = shift(database, 'open', again.performanceId, again.startsAt)

      expect(run(database, claimShiftStatement(open, member, 'CONFIRMED', gate))).toHaveLength(1)
    })
  })

  test('an officer\'s assignment and an added shift are refused the same way', async () => {
    await withDatabase((database) => {
      const { here, there } = twoVenues(database)
      const officer = trained(database, 'officer')
      const member = trained(database, 'member')
      shift(database, 'held', here.performanceId, here.startsAt, member)
      const open = shift(database, 'open', there.performanceId, there.startsAt)

      expect(run(database, assignShiftStatement(open, member, officer, gate))).toHaveLength(0)
      const input = { performanceId: there.performanceId, role: 'DOOR' as const, slot: 2, userId: member }
      expect(run(database, addShiftStatement('added', input, officer, OFFSETS, gate))).toHaveLength(0)
    })
  })

  test('the open list leaves out a shift that would clash', async () => {
    await withDatabase((database) => {
      const { here, there } = twoVenues(database)
      const member = trained(database, 'member')
      shift(database, 'held', here.performanceId, here.startsAt, member)
      shift(database, 'open', there.performanceId, there.startsAt)

      expect(run(database, openShiftsQuery({ notWorkedBy: member }, NOW, 25, 0))).toEqual([])
      expect(run(database, openShiftsQuery({}, NOW, 25, 0))).toHaveLength(1)
    })
  })
})

describe('a draft show offers no shifts (0211)', () => {
  test('its open shift is neither listed nor claimable', async () => {
    await withDatabase((database) => {
      const draft = tonightsPerformance(database, { suffix: 'a', night: NEXT_WEEK, showStatus: 'DRAFT' })
      const member = trained(database, 'member')
      const open = shift(database, 'open', draft.performanceId, draft.startsAt)

      expect(run(database, openShiftsQuery({}, NOW, 25, 0))).toEqual([])
      expect(run(database, claimShiftStatement(open, member, 'CONFIRMED', gate))).toHaveLength(0)
    })
  })
})

describe('a performance already over is not stamped (0211)', () => {
  test('tonight\'s finished matinee gets nothing, a later one is stamped', async () => {
    await withDatabase((database) => {
      const past = tonightsPerformance(database, { suffix: 'a', now: new Date(), curtainHoursAfterNightStart: 0 })
      // Back-dated so its two-hour running time is over whatever the hour.
      database.batch([['UPDATE performances SET starts_at = ?, doors_at = ? WHERE id = ?', NOW - 4 * 3600, NOW - 4 * 3600 - 1800, past.performanceId]])
      const later = tonightsPerformance(database, { suffix: 'b', night: NEXT_WEEK, venueId: past.venueId })
      database.batch([['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)', 'tpl', past.venueId, 'DOOR', 1]])

      run(database, backfillVenueStatement(past.venueId, 0, OFFSETS))

      expect(rows(database, 'SELECT id FROM shifts WHERE performance_id = ?', past.performanceId)).toEqual([])
      expect(rows(database, 'SELECT id FROM shifts WHERE performance_id = ?', later.performanceId)).toHaveLength(1)
    })
  })
})

describe('moving somebody from the bar to the door (0211)', () => {
  test('without a move the assignment is refused; with one, the bar shift reopens', async () => {
    await withDatabase((database) => {
      const { here } = twoVenues(database)
      const officer = trained(database, 'officer')
      const member = trained(database, 'member')
      const bar = shift(database, 'bar', here.performanceId, here.startsAt, member, 'BAR')
      const door = shift(database, 'door', here.performanceId, here.startsAt)

      expect(run(database, assignShiftStatement(door, member, officer, gate))).toHaveLength(0)

      expect(run(database, assignShiftStatement(door, member, officer, gate, true))).toHaveLength(1)
      // The route gates this on the assignment's audit row; here the assignment has applied.
      run(database, moveOffStatement(door, member, sql`1`))

      expect(statusOf(database, door)).toEqual({ status: 'CONFIRMED', user_id: member })
      expect(statusOf(database, bar)).toEqual({ status: 'OPEN', user_id: null })
    })
  })

  // The audit says a move took somebody off another shift only when there was one to take (0211).
  test('whether there is another shift to move off is read before the write', async () => {
    await withDatabase((database) => {
      const { here } = twoVenues(database)
      const member = trained(database, 'member')
      const door = shift(database, 'door', here.performanceId, here.startsAt)
      const heldOther = (): unknown => (run(database, otherShiftHeldQuery(door, member))[0] as { held: number }).held

      expect(heldOther()).toBe(0)
      shift(database, 'bar', here.performanceId, here.startsAt, member, 'BAR')
      expect(heldOther()).toBe(1)
    })
  })
})
