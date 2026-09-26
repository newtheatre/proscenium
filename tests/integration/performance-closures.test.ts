import { describe, expect, test } from 'bun:test'
import { performancesOnRoomsQuery } from '#server/utils/performance-closures'
import { showNightBounds, showNightOf } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1347: the performances that close a room are read in one statement for a span, whatever
// the programme holds (0006), from the venue's `room_id` (0043).

const NIGHT = showNightOf(new Date('2026-10-06T12:00:00Z'))
const NIGHT_START = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000)
const DAY_AFTER = NIGHT_START + 86_400

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

function run(database: TestDatabase, statement: SQL): { performanceId: string, roomId: string }[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as { performanceId: string, roomId: string }[]
}

const ids = (found: { performanceId: string }[]): string[] => found.map(row => row.performanceId).sort()

describe('the performances that close a room', () => {
  test('a performance at a venue with a room is read, with the room it closes and the show', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      const [row] = run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER))
      expect(row).toMatchObject({ performanceId: 'performance-house', roomId: 'auditorium', showTitle: 'A Test Show' })
    })
  })

  test('a venue with no room closes nothing, and a cancelled performance closes nothing', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'roomless', curtainHoursAfterNightStart: 15.5 })
      tonightsPerformance(database, { night: NIGHT, suffix: 'cancelled', roomId: 'auditorium', status: 'CANCELLED', curtainHoursAfterNightStart: 15.5 })
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER))).toEqual([])
    })
  })

  test('a draft performance closes its room: it is booked into the house even before it is on sale', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'draft', roomId: 'auditorium', status: 'DRAFT', curtainHoursAfterNightStart: 15.5 })
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER)))).toEqual(['performance-draft'])
    })
  })

  test('scoped to one room, another room\'s performances are left out', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 })
      tonightsPerformance(database, { night: NIGHT, suffix: 'studio', roomId: 'studio', curtainHoursAfterNightStart: 15.5 })
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER, 'studio')))).toEqual(['performance-studio'])
      expect(ids(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER)))).toEqual(['performance-house', 'performance-studio'])
    })
  })

  test('a performance a week away is not read for tonight', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'later', roomId: 'auditorium', curtainHoursAfterNightStart: 15.5 + 7 * 24 })
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER))).toEqual([])
    })
  })

  test('the statement binds the same parameters however many performances there are (0006)', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'busy', roomId: 'auditorium' })
      const before = boundStatement(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER)).length
      for (let at = 0; at < 5; at++) {
        tonightsPerformance(database, { night: NIGHT, suffix: `busy-${at}`, venueId: venue.id, curtainHoursAfterNightStart: 10 + at })
      }
      expect(boundStatement(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER)).length).toBe(before)
      expect(run(database, performancesOnRoomsQuery(NIGHT_START, DAY_AFTER))).toHaveLength(5)
    })
  })
})
