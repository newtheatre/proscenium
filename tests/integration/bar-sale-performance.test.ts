import { describe, expect, test } from 'bun:test'
import { barWindowsTonightQuery, replaceTemplateStatements } from '#server/utils/rota'
import { pickByWindow } from '#shared/utils/rota-times'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { WindowedPerformance } from '#shared/utils/rota-times'
import type { TemplateSlot } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// Which house a bar sale belongs to on a night running two (F-126, 0078): the window containing
// the sale, else the nearest, with a tie going to the earlier one.

const DEFAULTS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }
const NIGHT = currentShowNight()
const BOUNDS = showNightBounds(NIGHT)
const FROM = Math.floor(BOUNDS.from.getTime() / 1000)
const TO = Math.floor(BOUNDS.to.getTime() / 1000)

// London wall clock on the night, counted from its own 04:00 start (0014).
const at = (hours: number): number => FROM + Math.round(hours * 3600)

const MATINEE = at(10.5)
const EVENING = at(15.5)

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, id = 'officer'): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

// Two houses at one venue tonight: a matinee at 14:30 and an evening at 19:30, each two hours
// long with doors half an hour before.
function twoHouseNight(database: TestDatabase, slots: TemplateSlot[] = [{ role: 'BAR', count: 1 }]): string {
  const venue = testVenue(database)
  database.batch([
    ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-two', 'a-two-house-day', 'A Two House Day', 'PUBLISHED'],
    [`INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, 120, 'ON_SALE')`, 'performance-matinee', 'show-two', venue.id, MATINEE, MATINEE - 1800],
    [`INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, 120, 'ON_SALE')`, 'performance-evening', 'show-two', venue.id, EVENING, EVENING - 1800],
  ])
  const actorId = person(database)
  for (const statement of replaceTemplateStatements(venue.id, slots, actorId)) run(database, statement)
  return venue.id
}

function windowsFor(database: TestDatabase, venueId: string): WindowedPerformance[] {
  const [query, ...parameters] = boundStatement(database, barWindowsTonightQuery(venueId, FROM, TO, DEFAULTS))
  return database.raw.prepare(query).all(...parameters as never[]) as WindowedPerformance[]
}

describe('the bar\'s windows say which house a sale belongs to (F-126 criteria 1 and 2)', () => {
  test('both houses have a window, the bar\'s own, measured from doors and curtain down', async () => {
    await withDatabase(async (database) => {
      const venueId = twoHouseNight(database)
      const windows = windowsFor(database, venueId)

      expect(windows.map(window => window.performanceId)).toEqual(['performance-matinee', 'performance-evening'])
      // Doors less thirty minutes, to curtain plus two hours plus thirty.
      expect(windows[0]).toMatchObject({ startsAt: MATINEE - 3600, endsAt: MATINEE + 150 * 60 })
    })
  })

  test('a sale at 14:30 lands on the matinee and one at 20:30 on the evening', async () => {
    await withDatabase(async (database) => {
      const windows = windowsFor(database, twoHouseNight(database))

      expect(pickByWindow(windows, at(10.5))).toBe('performance-matinee')
      expect(pickByWindow(windows, at(16.5))).toBe('performance-evening')
    })
  })

  test('a sale between the two houses takes the nearer of them', async () => {
    await withDatabase(async (database) => {
      const windows = windowsFor(database, twoHouseNight(database))

      // 17:10, twenty minutes after the matinee's bar shut and fifty before the evening's opens.
      expect(pickByWindow(windows, at(13.17))).toBe('performance-matinee')
      // 18:20, an hour and fifty after the matinee and forty before the evening.
      expect(pickByWindow(windows, at(14.33))).toBe('performance-evening')
    })
  })

  test('a sale at 23:55, long after curtain down, still belongs to the evening', async () => {
    await withDatabase(async (database) => {
      const windows = windowsFor(database, twoHouseNight(database))

      expect(pickByWindow(windows, at(19.92))).toBe('performance-evening')
    })
  })

  test('the venue\'s own bar offsets move the window, so a late bar keeps its own sales', async () => {
    await withDatabase(async (database) => {
      const venueId = twoHouseNight(database, [{ role: 'BAR', count: 1, startsBeforeDoorsMinutes: 60, endsAfterEndMinutes: 120 }])
      const windows = windowsFor(database, venueId)

      expect(windows[0]).toMatchObject({ startsAt: MATINEE - 90 * 60, endsAt: MATINEE + 240 * 60 })
      // 23:00, inside the evening's widened window rather than merely nearest to it.
      expect(pickByWindow(windows, at(19))).toBe('performance-evening')
    })
  })
})

describe('a night with nothing running resolves no house (F-126 criterion 3)', () => {
  test('no window at all means no performance, which is what a bar opening looks like', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      expect(windowsFor(database, venue.id)).toEqual([])
      expect(pickByWindow([], at(15))).toBeNull()
    })
  })

  test('a cancelled house is not a window, so its venue resolves the other one', async () => {
    await withDatabase(async (database) => {
      const venueId = twoHouseNight(database)
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', 'performance-matinee']])

      const windows = windowsFor(database, venueId)
      expect(windows.map(window => window.performanceId)).toEqual(['performance-evening'])
      expect(pickByWindow(windows, at(10.5))).toBe('performance-evening')
    })
  })

  test('the query counts the night, not the day: tomorrow\'s house is not tonight\'s window', async () => {
    await withDatabase(async (database) => {
      const venueId = twoHouseNight(database)
      database.batch([['UPDATE performances SET starts_at = ? WHERE id = ?', EVENING + 24 * 3600, 'performance-evening']])

      expect(rows(database, 'SELECT id FROM performances').length).toBe(2)
      expect(windowsFor(database, venueId).map(window => window.performanceId)).toEqual(['performance-matinee'])
    })
  })
})
