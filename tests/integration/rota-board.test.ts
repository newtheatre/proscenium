import { describe, expect, test } from 'bun:test'
import { rosterPerformancesQuery, rosterShiftsQuery } from '#server/utils/rota'
import { daysAfter } from '#shared/utils/membership'
import { boardWindowBounds } from '#shared/utils/rota-board'
import { currentShowNight } from '#shared/utils/show-night'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The rota board's window against the real migrations (E-107 criterion 7): the board reads the
// nights it was asked for, not a fixed count of whatever comes next.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as T[]
}

const tonight = currentShowNight()

// Four nights: yesterday, tonight, a week out and a month out, so a fortnight holds two of them.
function fourNights(database: TestDatabase): void {
  testVenue(database, { suffix: 'a' })
  tonightsPerformance(database, { suffix: 'past', night: daysAfter(tonight, -1), venueId: 'venue-a' })
  tonightsPerformance(database, { suffix: 'tonight', night: tonight, venueId: 'venue-a' })
  tonightsPerformance(database, { suffix: 'soon', night: daysAfter(tonight, 7), venueId: 'venue-a' })
  tonightsPerformance(database, { suffix: 'later', night: daysAfter(tonight, 30), venueId: 'venue-a' })
}

const found = (database: TestDatabase, from: string, to: string): string[] => {
  const bounds = boardWindowBounds({ from, to })
  return run<{ performanceId: string }>(database, rosterPerformancesQuery(bounds))
    .map(row => row.performanceId)
}

describe('the board reads the window it was given (E-107 criterion 7)', () => {
  test('a fortnight from tonight holds tonight and the week out, not the month out', async () => {
    await withDatabase((database) => {
      fourNights(database)
      expect(found(database, tonight, daysAfter(tonight, 13))).toEqual(['performance-tonight', 'performance-soon'])
    })
  })

  test('a window ending tonight still holds tonight whole, 04:00 to 04:00 (0014)', async () => {
    await withDatabase((database) => {
      fourNights(database)
      expect(found(database, tonight, tonight)).toEqual(['performance-tonight'])
    })
  })

  test('a window that has been and gone reads the past rather than the next fortnight', async () => {
    await withDatabase((database) => {
      fourNights(database)
      expect(found(database, daysAfter(tonight, -1), daysAfter(tonight, -1))).toEqual(['performance-past'])
    })
  })

  test('a cancelled performance is never on the board', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a' })
      tonightsPerformance(database, { suffix: 'off', night: tonight, venueId: 'venue-a', status: 'CANCELLED' })
      expect(found(database, tonight, daysAfter(tonight, 13))).toEqual([])
    })
  })

  test('the shifts read are the ones the same window names', async () => {
    await withDatabase((database) => {
      fourNights(database)
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'shift-tonight', 'performance-tonight', 'DOOR', 1, 'OPEN'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'shift-later', 'performance-later', 'DOOR', 1, 'OPEN'],
      ])
      const bounds = boardWindowBounds({ from: tonight, to: daysAfter(tonight, 13) })
      const held = run<{ shiftId: string }>(database, rosterShiftsQuery(bounds)).map(row => row.shiftId)
      expect(held).toEqual(['shift-tonight'])
    })
  })
})

describe('the window binds a fixed number of parameters however long it is (0006)', () => {
  test('a two-year window binds no more than a one-night one', async () => {
    await withDatabase((database) => {
      const narrow = boundStatement(database, rosterPerformancesQuery(boardWindowBounds({ from: tonight, to: tonight })))
      const wide = boundStatement(database, rosterPerformancesQuery(boardWindowBounds({ from: tonight, to: daysAfter(tonight, 700) })))
      expect(wide.length).toBe(narrow.length)
      expect(wide.length - 1).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
    })
  })
})

describe('the rows the board reads are ordered by when the night starts', () => {
  test('the nearest performance comes first', async () => {
    await withDatabase((database) => {
      fourNights(database)
      expect(found(database, daysAfter(tonight, -1), daysAfter(tonight, 30)))
        .toEqual(['performance-past', 'performance-tonight', 'performance-soon', 'performance-later'])
    })
  })
})
