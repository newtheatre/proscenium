import { describe, expect, test } from 'bun:test'
import {
  claimedShiftTonightQuery,
  dutyManagersOnCall,
  readTeamRow,
  tonightHouseQuery,
  tonightPerformanceQuery,
  tonightTeamQuery,
} from '#server/utils/tonight'
import { ticketInsertQueries } from '#server/utils/capacity'
import { daysAfter } from '#shared/utils/membership'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

// E-112 against the real migrations. `tests/unit/tonight.test.ts` pins `readTeamRow` in the pure.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, phone, verified) VALUES (?, ?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`, '07700 900000']])
  return id
}

function reserve(database: TestDatabase, id: string, performanceId: string, status = 'PENDING'): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, status, 'WEB']])
}

function ticket(database: TestDatabase, id: string, performanceId: string, reservationId: string, refunded = false): void {
  const [statement] = ticketInsertQueries([{ id, reservationId, performanceId, ticketTypeId: 'tt-standard', pricePaid: 900, priceSource: 'BASE' }], null)
  database.batch([boundStatement(database, statement!)])
  if (refunded) database.batch([['UPDATE tickets SET refunded_at = unixepoch() WHERE id = ?', id]])
}

describe('the house numbers (E-112 criterion 1)', () => {
  test('nothing sold and nobody admitted reads as nought, not fabricated', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 0, admitted: 0 })
    })
  })

  test('a pending hold and a desk collection both count as sold', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-pending', tonight.performanceId, 'PENDING')
      ticket(database, 't-pending', tonight.performanceId, 'r-pending')
      reserve(database, 'r-collected', tonight.performanceId, 'COLLECTED')
      ticket(database, 't-collected', tonight.performanceId, 'r-collected')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 2, admitted: 0 })
    })
  })

  test('a door-admitted reservation counts as both sold and admitted', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-door', tonight.performanceId, 'DOOR')
      ticket(database, 't-door', tonight.performanceId, 'r-door')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 1, admitted: 1 })
    })
  })

  test('a refunded ticket and an expired hold neither count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-refunded', tonight.performanceId, 'PENDING')
      ticket(database, 't-refunded', tonight.performanceId, 'r-refunded', true)
      reserve(database, 'r-expired', tonight.performanceId, 'EXPIRED')
      ticket(database, 't-expired', tonight.performanceId, 'r-expired')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 0, admitted: 0 })
    })
  })
})

describe('the team roster (E-112 criterion 2)', () => {
  function shift(database: TestDatabase, id: string, performanceId: string, status: ShiftStatus, userId: string | null): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      id, performanceId, 'DOOR', userId, status]])
  }

  test('a confirmed, consenting holder shows their name and phone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'consenting')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'shift-a', tonight.performanceId, 'CONFIRMED', who)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: true, name: 'Someone consenting', phone: '07700 900000' })
    })
  })

  test('a confirmed holder who has not consented shows their name but not their phone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'quiet')
      shift(database, 'shift-b', tonight.performanceId, 'CONFIRMED', who)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: true, name: 'Someone quiet', phone: null })
    })
  })

  test('an open shift reads as unfilled, never a blank name', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      shift(database, 'shift-c', tonight.performanceId, 'OPEN', null)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: false, name: null, phone: null })
    })
  })

  test('a claim waiting for an officer names its claimant as claimed, never as filled (issue 1303)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'claimant')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'shift-claimed', tonight.performanceId, 'CLAIMED', who)

      const [row] = read(database, tonightTeamQuery(tonight.performanceId)) as Parameters<typeof readTeamRow>[0][]
      expect(readTeamRow(row!)).toMatchObject({ filled: false, claimed: true, name: 'Someone claimant', phone: null })
    })
  })

  test('a cancelled shift does not appear at all', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'gone')
      shift(database, 'shift-d', tonight.performanceId, 'CANCELLED', who)

      expect(read(database, tonightTeamQuery(tonight.performanceId))).toHaveLength(0)
    })
  })
})

describe('the performance a screen is asked about', () => {
  test('carries the show\'s latecomer policy and age guidance', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      database.batch([['UPDATE shows SET latecomer_policy = ?, age_guidance = ? WHERE id = ?',
        'AT_INTERVAL', 'Contains strobe lighting', tonight.showId]])

      const [row] = read<{ latecomerPolicy: string, ageGuidance: string, venueName: string }>(
        database, tonightPerformanceQuery(tonight.performanceId))
      expect(row).toMatchObject({ latecomerPolicy: 'AT_INTERVAL', ageGuidance: 'Contains strobe lighting' })
    })
  })
})

// The emergency card names who to ring after 999, and the number comes from tonight's own rota
// rather than a standing list (E-113, 0009, issue 1150 item 14).
describe('who to ring after 999 (E-113 criterion 1)', () => {
  function shift(database: TestDatabase, id: string, performanceId: string, role: string, userId: string): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      id, performanceId, role, userId, 'CONFIRMED']])
  }

  function team(database: TestDatabase, performanceIds: string[]): ReturnType<typeof readTeamRow>[] {
    return performanceIds
      .flatMap(id => read(database, tonightTeamQuery(id)) as Parameters<typeof readTeamRow>[0][])
      .map(row => readTeamRow(row))
  }

  test('a consenting duty manager is the number the card carries', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-consenting')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'dm-shift', tonight.performanceId, 'DUTY_MANAGER', who)

      expect(dutyManagersOnCall(team(database, [tonight.performanceId])))
        .toEqual([{ name: 'Someone dm-consenting', phone: '07700 900000' }])
    })
  })

  test('a duty manager who has not consented leaves the card with no number (A-114)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-quiet')
      shift(database, 'dm-quiet-shift', tonight.performanceId, 'DUTY_MANAGER', who)

      expect(dutyManagersOnCall(team(database, [tonight.performanceId]))).toEqual([])
    })
  })

  test('a claimed duty manager is left off the call list until an officer confirms them (issue 1303)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-claimed')
      database.batch([
        ['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'dm-claimed-shift', tonight.performanceId, 'DUTY_MANAGER', who, 'CLAIMED'],
      ])

      expect(dutyManagersOnCall(team(database, [tonight.performanceId]))).toEqual([])
    })
  })

  test('the door is not who you ring after 999', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'door-consenting')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'door-shift', tonight.performanceId, 'DOOR', who)

      expect(dutyManagersOnCall(team(database, [tonight.performanceId]))).toEqual([])
    })
  })

  // A matinee day resolves two performances, and the same person holding both is one number to
  // ring, not two identical rows (E-112 criterion 2, E-127 criterion 1).
  test('one person across both of tonight\'s houses is one number', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee' })
      const evening = tonightsPerformance(database, { suffix: 'evening' })
      const who = person(database, 'dm-both')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      shift(database, 'dm-matinee', matinee.performanceId, 'DUTY_MANAGER', who)
      shift(database, 'dm-evening', evening.performanceId, 'DUTY_MANAGER', who)

      expect(dutyManagersOnCall(team(database, [matinee.performanceId, evening.performanceId])))
        .toEqual([{ name: 'Someone dm-both', phone: '07700 900000' }])
    })
  })
})

// A claim waiting for an officer is what the refusal names, so somebody who claimed is told that
// rather than told they hold nothing (E-112 criterion 2, E-104, issue 1303).
describe('a claim waiting tonight, for the refusal that names it', () => {
  function bounds(night: string): [number, number] {
    const { from, to } = showNightBounds(night)
    return [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)]
  }

  function claimed(database: TestDatabase, userId: string, role: ShiftRole, night: string): boolean {
    const [row] = read<{ claimed: number }>(database, claimedShiftTonightQuery(userId, role, ...bounds(night)))
    return Boolean(row?.claimed)
  }

  function shift(database: TestDatabase, id: string, performanceId: string, role: ShiftRole, userId: string, status: ShiftStatus): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      id, performanceId, role, userId, status]])
  }

  test('a door claim tonight is found for the door, and not for the bar', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'tomasz')
      shift(database, 'door-claimed', tonight.performanceId, 'DOOR', who, 'CLAIMED')

      expect(claimed(database, who, 'DOOR', tonight.night)).toBe(true)
      expect(claimed(database, who, 'BAR', tonight.night)).toBe(false)
    })
  })

  test('a confirmed shift, a declined claim and tomorrow\'s claim are not tonight\'s claim', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const tomorrow = tonightsPerformance(database, { suffix: 'b', night: daysAfter(tonight.night, 1) })
      const confirmed = person(database, 'confirmed')
      const declined = person(database, 'declined')
      const early = person(database, 'early')
      shift(database, 'door-confirmed', tonight.performanceId, 'DOOR', confirmed, 'CONFIRMED')
      shift(database, 'dm-declined', tonight.performanceId, 'DUTY_MANAGER', declined, 'DECLINED')
      shift(database, 'door-tomorrow', tomorrow.performanceId, 'DOOR', early, 'CLAIMED')

      expect(claimed(database, confirmed, 'DOOR', tonight.night)).toBe(false)
      expect(claimed(database, declined, 'DUTY_MANAGER', tonight.night)).toBe(false)
      expect(claimed(database, early, 'DOOR', tonight.night)).toBe(false)
    })
  })

  test('a bar claim on tonight\'s bar opening is found for the bar (0077)', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      const night = currentShowNight()
      const [from] = bounds(night)
      const who = person(database, 'barkeep')
      database.batch([
        ['INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)',
          'opening-a', venue.id, night, 'Society social', from + 14 * 3600, from + 19 * 3600],
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, 1, ?, ?)',
          'opening-a-1', 'opening-a', who, 'CLAIMED'],
      ])

      expect(claimed(database, who, 'BAR', night)).toBe(true)
      expect(claimed(database, who, 'DOOR', night)).toBe(false)
    })
  })
})
