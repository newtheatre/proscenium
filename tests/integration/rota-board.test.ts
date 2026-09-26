import { describe, expect, test } from 'bun:test'
import { rosterOpeningShiftsQuery, rosterOpeningsQuery, rosterPerformancesQuery, rosterShiftsQuery, waitingClaimsQuery } from '#server/utils/rota'
import { daysAfter } from '#shared/utils/membership'
import { boardWindowBounds } from '#shared/utils/rota-board'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
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

// A bar opening on the board (E-130 criterion 8, issue 1216): the same window, read by its own
// scope, because an opening names no performance (0077).
function barOpening(database: TestDatabase, id: string, night: string, status = 'PLANNED'): void {
  const opensAt = Math.floor(showNightBounds(night).from.getTime() / 1000) + 18 * 3600
  database.batch([[
    'INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, 'venue-a', night, `Opening ${id}`, opensAt, opensAt + 5 * 3600, status,
  ]])
}

const openingsFound = (database: TestDatabase, from: string, to: string): string[] =>
  run<{ openingId: string }>(database, rosterOpeningsQuery(boardWindowBounds({ from, to })))
    .map(row => row.openingId)

describe('the board reads bar openings in the same window (E-130 criterion 8)', () => {
  test('an opening inside the window is read and one outside it is not', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a' })
      barOpening(database, 'opening-soon', daysAfter(tonight, 3))
      barOpening(database, 'opening-later', daysAfter(tonight, 30))
      barOpening(database, 'opening-past', daysAfter(tonight, -1))
      expect(openingsFound(database, tonight, daysAfter(tonight, 13))).toEqual(['opening-soon'])
    })
  })

  test('an opening carries its label, venue and night, and names no show', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a', name: 'The Hire Room' })
      barOpening(database, 'opening-soon', daysAfter(tonight, 3))
      const bounds = boardWindowBounds({ from: tonight, to: daysAfter(tonight, 13) })
      const [row] = run<Record<string, unknown>>(database, rosterOpeningsQuery(bounds))
      expect(row).toMatchObject({
        openingId: 'opening-soon',
        label: 'Opening opening-soon',
        venueName: 'The Hire Room',
        night: daysAfter(tonight, 3),
      })
      expect(row).not.toHaveProperty('showTitle')
      expect(row).not.toHaveProperty('performanceId')
    })
  })

  test('a cancelled opening is never on the board', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a' })
      barOpening(database, 'opening-off', tonight, 'CANCELLED')
      expect(openingsFound(database, tonight, daysAfter(tonight, 13))).toEqual([])
    })
  })

  test('openings are read nearest first', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a' })
      barOpening(database, 'opening-b', daysAfter(tonight, 5))
      barOpening(database, 'opening-a', daysAfter(tonight, 2))
      expect(openingsFound(database, tonight, daysAfter(tonight, 13))).toEqual(['opening-a', 'opening-b'])
    })
  })

  test('the slots read are the uncancelled ones on openings the same window names', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'a' })
      barOpening(database, 'opening-soon', daysAfter(tonight, 3))
      barOpening(database, 'opening-later', daysAfter(tonight, 30))
      database.batch([
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, status) VALUES (?, ?, ?, ?)', 'slot-soon-1', 'opening-soon', 1, 'OPEN'],
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, status) VALUES (?, ?, ?, ?)', 'slot-soon-2', 'opening-soon', 2, 'CANCELLED'],
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, status) VALUES (?, ?, ?, ?)', 'slot-later-1', 'opening-later', 1, 'OPEN'],
      ])
      const bounds = boardWindowBounds({ from: tonight, to: daysAfter(tonight, 13) })
      expect(run<Record<string, unknown>>(database, rosterOpeningShiftsQuery(bounds))).toEqual([
        { openingId: 'opening-soon', shiftId: 'slot-soon-1', slot: 1, status: 'OPEN', holderName: null },
      ])
    })
  })

  test('the opening reads bind a fixed number of parameters however long the window is (0006)', async () => {
    await withDatabase((database) => {
      for (const query of [rosterOpeningsQuery, rosterOpeningShiftsQuery]) {
        const narrow = boundStatement(database, query(boardWindowBounds({ from: tonight, to: tonight })))
        const wide = boundStatement(database, query(boardWindowBounds({ from: tonight, to: daysAfter(tonight, 700) })))
        expect(wide.length).toBe(narrow.length)
        expect(wide.length - 1).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
      }
    })
  })
})

// Issue #1365 and E-105 criterion 2: the approvals queue became the board's "Waiting for
// confirmation" filter, so it reads every claim waiting, whatever the window, and counts them.
describe('the board\'s waiting filter is the approvals queue', () => {
  function claims(database: TestDatabase): void {
    fourNights(database)
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'claimant', 'claimant@example.invalid', 'Clara Claimant'],
      ['INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)', 'shift-past-claimed', 'performance-past', 'DOOR', 1, 'CLAIMED', 'claimant'],
      ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)', 'shift-tonight-open', 'performance-tonight', 'DOOR', 1, 'OPEN'],
      ['INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)', 'shift-later-claimed', 'performance-later', 'BAR', 1, 'CLAIMED', 'claimant'],
      ['INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)', 'shift-later-confirmed', 'performance-later', 'DOOR', 1, 'CONFIRMED', 'claimant'],
    ])
  }

  test('every performance holding a claim is read, beyond any window, and no other', async () => {
    await withDatabase((database) => {
      claims(database)
      expect(run<{ performanceId: string }>(database, rosterPerformancesQuery('waiting')).map(row => row.performanceId))
        .toEqual(['performance-past', 'performance-later'])
    })
  })

  test('its cards come whole, so the claim is read beside the shifts already filled', async () => {
    await withDatabase((database) => {
      claims(database)
      expect(run<{ shiftId: string }>(database, rosterShiftsQuery('waiting')).map(row => row.shiftId).sort())
        .toEqual(['shift-later-claimed', 'shift-later-confirmed', 'shift-past-claimed'])
    })
  })

  test('the count is the claims waiting, as the filter\'s label says it', async () => {
    await withDatabase((database) => {
      claims(database)
      expect(run<{ waiting: number }>(database, waitingClaimsQuery())).toEqual([{ waiting: 2 }])
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', 'performance-later']])
      expect(run<{ waiting: number }>(database, waitingClaimsQuery())).toEqual([{ waiting: 1 }])
    })
  })
})
