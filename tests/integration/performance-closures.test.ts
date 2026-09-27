import { describe, expect, test } from 'bun:test'
import { performancesOnRoomsQuery } from '#server/utils/performance-closures'
import { showNightOf, showNightOpensAt } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1347: the performances that close a room are read in one statement for a span, whatever
// the programme holds (0006), from the venue's `room_id` (0043).

const NIGHT = showNightOf(new Date('2026-10-06T12:00:00Z'))
const NIGHT_START = showNightOpensAt(NIGHT)
const DAY_AFTER = NIGHT_START + 86_400
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'auditorium', 'The Auditorium'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'studio', 'The Studio'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

interface Read { performanceId: string, roomId: string, showTitle: string | null, listedTitle: string }

function run(database: TestDatabase, statement: SQL): Read[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as Read[]
}

const ids = (found: { performanceId: string }[]): string[] => found.map(row => row.performanceId).sort()

describe('the performances that close a room', () => {
  test('a performance at a venue with a room is read, with the room it closes and the show', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      const [row] = run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS))
      expect(row).toMatchObject({ performanceId: 'performance-house', roomId: 'auditorium', showTitle: 'A Test Show' })
    })
  })

  test('a venue with no room closes nothing, and a cancelled performance closes nothing', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'roomless', curtainHoursAfterNightStart: 15.5 })
      tonightsPerformance(database, { night: NIGHT, suffix: 'cancelled', roomId: 'auditorium', status: 'CANCELLED', curtainHoursAfterNightStart: 15.5 })
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS))).toEqual([])
    })
  })

  test('a draft performance closes its room: it is booked into the house even before it is on sale', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'draft', roomId: 'auditorium', status: 'DRAFT', curtainHoursAfterNightStart: 15.5 })
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS)))).toEqual(['performance-draft'])
    })
  })

  test('scoped to one room, another room\'s performances are left out', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      tonightsPerformance(database, { night: NIGHT, suffix: 'studio', roomId: 'studio', curtainHoursAfterNightStart: 15.5 })
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS, 'studio')))).toEqual(['performance-studio'])
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS)))).toEqual(['performance-house', 'performance-studio'])
    })
  })

  // D-121: a show nobody has published is nowhere public, and a member reads this through the calendar.
  test('an unpublished show\'s title is withheld from the closure, and kept for the officers\' list', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'unpublished', roomId: 'auditorium', showStatus: 'DRAFT', curtainHoursAfterNightStart: 15.5 })
      const [row] = run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS))
      expect(row).toMatchObject({ showTitle: null, listedTitle: 'A Test Show' })
    })
  })

  // Read by the computed window, not by the curtain: a doors time typed a day early closes the
  // room from then, and the booking write sees it just as the calendar does (0078).
  test('the window decides what is read, however far doors run ahead of the curtain', async () => {
    await withDatabase((database) => {
      const curtain = NIGHT_START + 15.5 * 3600
      tonightsPerformance(database, { night: NIGHT, suffix: 'early-doors', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      database.batch([['UPDATE performances SET doors_at = ? WHERE id = ?', curtain - 23 * 3600, 'performance-early-doors']])

      const dayBefore = NIGHT_START - 86_400
      expect(ids(run(database, performancesOnRoomsQuery(dayBefore + 19 * 3600, dayBefore + 21 * 3600, OFFSETS)))).toEqual(['performance-early-doors'])
      expect(run(database, performancesOnRoomsQuery(dayBefore + 12 * 3600, dayBefore + 14 * 3600, OFFSETS))).toEqual([])
    })
  })

  test('a window that ended before the span is not read', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'over', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      // Curtain 19:30, two hours' running and thirty minutes after: the window ends at 22:00.
      expect(run(database, performancesOnRoomsQuery(NIGHT_START + 18.5 * 3600, DAY_AFTER, OFFSETS))).toEqual([])
      expect(run(database, performancesOnRoomsQuery(NIGHT_START + 17.5 * 3600, DAY_AFTER, OFFSETS))).toHaveLength(1)
    })
  })

  test('a performance a week away is not read for tonight', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'later', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 + 7 * 24 })
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS))).toEqual([])
    })
  })

  test('the statement binds the same parameters however many performances there are (0006)', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'busy', roomId: 'auditorium' })
      const before = boundStatement(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS)).length
      for (let at = 0; at < 5; at++) {
        tonightsPerformance(database, { night: NIGHT, suffix: `busy-${at}`, venueId: venue.id, curtainHoursAfterNightStart: 10 + at })
      }
      expect(boundStatement(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS)).length).toBe(before)
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, OFFSETS))).toHaveLength(5)
    })
  })
})
