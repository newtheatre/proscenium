import { describe, expect, test } from 'bun:test'
import {
  claimedShiftTonightQuery,
  dutyManagersOnCall,
  firstAidersTonightQuery,
  readFirstAiders,
  readTeamRow,
  shareNumberStatement,
  tonightHouseQuery,
  tonightPerformanceQuery,
  tonightTeamQuery,
  venuesTonightQuery,
} from '#server/utils/tonight'
import { claimShiftStatement } from '#server/utils/rota'
import { ticketInsertQueries } from '#server/utils/capacity'
import { daysAfter } from '#shared/utils/membership'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { ConfirmedShiftScope } from '#server/utils/rota'
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

  // Seats on both sides, so "to come" (sold less in) is people still expected, never people less
  // bookings (issue 1326's rule for the desk, held on the hub too).
  test('a party of three through the door is three in, as it is three sold; a refunded seat is neither', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-party', tonight.performanceId, 'DOOR')
      for (const id of ['t-party-1', 't-party-2', 't-party-3']) ticket(database, id, tonight.performanceId, 'r-party')
      ticket(database, 't-party-refunded', tonight.performanceId, 'r-party', true)
      reserve(database, 'r-coming', tonight.performanceId, 'COLLECTED')
      for (const id of ['t-coming-1', 't-coming-2']) ticket(database, id, tonight.performanceId, 'r-coming')

      const [row] = read<{ sold: number, admitted: number }>(database, tonightHouseQuery(tonight.performanceId))
      expect(row).toMatchObject({ sold: 5, admitted: 3 })
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

function rostered(database: TestDatabase, id: string, performanceId: string, role: ShiftRole, userId: string, status: ShiftStatus = 'CONFIRMED'): void {
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
    id, performanceId, role, userId, status]])
}

// The emergency card names who to ring after 999, and the number comes from tonight's own rota
// rather than a standing list (E-113, 0009, issue 1150 item 14).
describe('who to ring after 999 (E-113 criterion 1)', () => {
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
      rostered(database, 'dm-shift', tonight.performanceId, 'DUTY_MANAGER', who)

      expect(dutyManagersOnCall(team(database, [tonight.performanceId])))
        .toEqual([{ name: 'Someone dm-consenting', phone: '07700 900000' }])
    })
  })

  test('a duty manager who has not consented leaves the card with no number (A-114)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-quiet')
      rostered(database, 'dm-quiet-shift', tonight.performanceId, 'DUTY_MANAGER', who)

      expect(dutyManagersOnCall(team(database, [tonight.performanceId]))).toEqual([])
    })
  })

  test('a claimed duty manager is left off the call list until an officer confirms them (issue 1303)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-claimed')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      rostered(database, 'dm-claimed-shift', tonight.performanceId, 'DUTY_MANAGER', who, 'CLAIMED')

      expect(dutyManagersOnCall(team(database, [tonight.performanceId]))).toEqual([])
    })
  })

  test('the door is not who you ring after 999', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'door-consenting')
      database.batch([['INSERT INTO shift_contact_preferences (user_id, visible) VALUES (?, 1)', who]])
      rostered(database, 'door-shift', tonight.performanceId, 'DOOR', who)

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
      rostered(database, 'dm-matinee', matinee.performanceId, 'DUTY_MANAGER', who)
      rostered(database, 'dm-evening', evening.performanceId, 'DUTY_MANAGER', who)

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

  function claimed(database: TestDatabase, userId: string, role: ShiftRole, night: string, scope: ConfirmedShiftScope = {}): boolean {
    const [row] = read<{ claimed: number }>(database, claimedShiftTonightQuery(userId, role, ...bounds(night), scope))
    return Boolean(row?.claimed)
  }

  test('a door claim tonight is found for the door, and not for the bar', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'tomasz')
      rostered(database, 'door-claimed', tonight.performanceId, 'DOOR', who, 'CLAIMED')

      expect(claimed(database, who, 'DOOR', tonight.night)).toBe(true)
      expect(claimed(database, who, 'BAR', tonight.night)).toBe(false)
    })
  })

  // Confirming a claim at one venue would not open another, so an ask there is not told about it.
  test('a door claim at another venue or on another performance is not found for a narrowed ask', async () => {
    await withDatabase(async (database) => {
      const house = tonightsPerformance(database)
      const studio = tonightsPerformance(database, { suffix: 'studio' })
      const who = person(database, 'tomasz')
      rostered(database, 'door-claimed', house.performanceId, 'DOOR', who, 'CLAIMED')

      expect(claimed(database, who, 'DOOR', house.night, { venueId: house.venueId })).toBe(true)
      expect(claimed(database, who, 'DOOR', house.night, { venueId: studio.venueId })).toBe(false)
      expect(claimed(database, who, 'DOOR', house.night, { performanceId: studio.performanceId })).toBe(false)
    })
  })

  test('a confirmed shift, a declined claim and tomorrow\'s claim are not tonight\'s claim', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const tomorrow = tonightsPerformance(database, { suffix: 'b', night: daysAfter(tonight.night, 1) })
      const confirmed = person(database, 'confirmed')
      const declined = person(database, 'declined')
      const early = person(database, 'early')
      rostered(database, 'door-confirmed', tonight.performanceId, 'DOOR', confirmed, 'CONFIRMED')
      rostered(database, 'dm-declined', tonight.performanceId, 'DUTY_MANAGER', declined, 'DECLINED')
      rostered(database, 'door-tomorrow', tomorrow.performanceId, 'DOOR', early, 'CLAIMED')

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
      expect(claimed(database, who, 'BAR', night, { venueId: venue.id })).toBe(true)
      expect(claimed(database, who, 'BAR', night, { venueId: 'venue-elsewhere' })).toBe(false)
    })
  })
})

function nightSeconds(night: string): [number, number] {
  const { from, to } = showNightBounds(night)
  return [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)]
}

function opening(database: TestDatabase, id: string, venueId: string, night: string, status = 'PLANNED'): void {
  const [from] = nightSeconds(night)
  database.batch([['INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, venueId, night, 'Society social', from + 14 * 3600, from + 19 * 3600, status]])
}

// Anyone signed in reads the card of every venue running tonight, a bar opening's included
// (E-113 criterion 2 as amended, 0077, issue 1310).
describe('the venues running tonight (issue 1310)', () => {
  test('a venue with a performance or a bar opening tonight, once each, in name order', async () => {
    await withDatabase(async (database) => {
      const house = tonightsPerformance(database, { suffix: 'b' })
      tonightsPerformance(database, { suffix: 'b2', venueId: house.venueId })
      const studio = testVenue(database, { suffix: 'a' })
      opening(database, 'opening-studio', studio.id, house.night)

      expect(read(database, venuesTonightQuery(...nightSeconds(house.night)))).toEqual([
        { venueId: studio.id, venueName: 'The Test House a' },
        { venueId: house.venueId, venueName: 'The Test House b' },
      ])
    })
  })

  test('a cancelled performance, a cancelled opening and tomorrow\'s performance are not tonight', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database, { suffix: 'c' })
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', tonight.performanceId]])
      const studio = testVenue(database, { suffix: 'd' })
      opening(database, 'opening-cancelled', studio.id, tonight.night, 'CANCELLED')
      tonightsPerformance(database, { suffix: 'e', night: daysAfter(tonight.night, 1) })

      expect(read(database, venuesTonightQuery(...nightSeconds(tonight.night)))).toEqual([])
    })
  })

  // An external venue keeps its own building's procedures until we staff a night there (issue 1318).
  test('an external venue counts once its performance tonight carries a shift that is not cancelled', async () => {
    await withDatabase(async (database) => {
      const hired = testVenue(database, { suffix: 'hired', isExternal: true })
      const tonight = tonightsPerformance(database, { suffix: 'hired', venueId: hired.id })
      const night = nightSeconds(tonight.night)
      expect(read(database, venuesTonightQuery(...night))).toEqual([])

      rostered(database, 'hired-door', tonight.performanceId, 'DOOR', person(database, 'hired-door'), 'CLAIMED')
      expect(read(database, venuesTonightQuery(...night))).toEqual([{ venueId: hired.id, venueName: 'The Test House hired' }])
    })
  })
})

// Tonight's first aiders come off tonight's own confirmed rota and a current record of the
// module the committee names, never a standing list (E-113 criterion 1 as amended, 0009).
describe('tonight\'s first aiders (issue 1310)', () => {
  const FIRST_AID = 'SAFE-101'
  const TODAY = '2026-10-12'

  function named(database: TestDatabase, id: string, name: string): string {
    database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
      id, name, `${id}@e2e.newtheatre.org.uk`]])
    return id
  }

  function certified(database: TestDatabase, userId: string, options: { module?: string, expiresOn?: string | null, revoked?: boolean } = {}): void {
    const module = options.module ?? FIRST_AID
    database.batch([
      ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'SAFE', 'Safety'],
      ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', module, 'SAFE', 'MODULE', `Module ${module}`],
      [`INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source, revoked_at)
        VALUES (?, ?, ?, '2025-09-01', ?, 'SIGNOFF', ?)`,
      `tr-${userId}-${module}`, userId, module, options.expiresOn ?? null, options.revoked ? 1_700_000_000 : null],
    ])
  }

  function firstAiders(database: TestDatabase, venueId: string, night: string): ReturnType<typeof readFirstAiders> {
    return readFirstAiders(read(database, firstAidersTonightQuery(venueId, ...nightSeconds(night), FIRST_AID, TODAY)))
  }

  test('a confirmed volunteer holding a current record, once, by first name with every job tonight', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee' })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: matinee.venueId })
      const sam = named(database, 'sam', 'Sam Okafor')
      certified(database, sam, { expiresOn: '2026-10-20' })
      rostered(database, 'sam-matinee', matinee.performanceId, 'BAR', sam)
      rostered(database, 'sam-evening', evening.performanceId, 'DUTY_MANAGER', sam)

      expect(firstAiders(database, matinee.venueId, matinee.night)).toEqual([{ firstName: 'Sam', roles: ['DUTY_MANAGER', 'BAR'] }])
    })
  })

  test('a claim, a lapsed or revoked record, another module and another venue are not tonight\'s first aiders', async () => {
    await withDatabase(async (database) => {
      const house = tonightsPerformance(database, { suffix: 'house' })
      const late = tonightsPerformance(database, { suffix: 'late', venueId: house.venueId })
      const studio = tonightsPerformance(database, { suffix: 'studio' })
      const claimant = named(database, 'claimant', 'Clara Claimant')
      const lapsed = named(database, 'lapsed', 'Lee Lapsed')
      const revoked = named(database, 'revoked', 'Rae Revoked')
      const other = named(database, 'other', 'Otto Other')
      const elsewhere = named(database, 'elsewhere', 'Ella Elsewhere')
      certified(database, claimant)
      certified(database, lapsed, { expiresOn: TODAY })
      certified(database, revoked, { revoked: true })
      certified(database, other, { module: 'SAFE-102' })
      certified(database, elsewhere)
      rostered(database, 'claimed-door', house.performanceId, 'DOOR', claimant, 'CLAIMED')
      rostered(database, 'lapsed-bar', house.performanceId, 'BAR', lapsed)
      rostered(database, 'revoked-dm', house.performanceId, 'DUTY_MANAGER', revoked)
      rostered(database, 'other-door', late.performanceId, 'DOOR', other)
      rostered(database, 'elsewhere-door', studio.performanceId, 'DOOR', elsewhere)

      expect(firstAiders(database, house.venueId, house.night)).toEqual([])
      expect(firstAiders(database, studio.venueId, studio.night)).toEqual([{ firstName: 'Ella', roles: ['DOOR'] }])
    })
  })

  test('a confirmed slot on tonight\'s bar opening at the venue counts (0077)', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database, { suffix: 'social' })
      const night = currentShowNight()
      opening(database, 'opening-social', venue.id, night)
      const barkeep = named(database, 'barkeep', 'Bea Barkeep')
      const waiting = named(database, 'waiting', 'Wes Waiting')
      certified(database, barkeep)
      certified(database, waiting)
      database.batch([
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, 1, ?, ?)', 'social-1', 'opening-social', barkeep, 'CONFIRMED'],
        ['INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, 2, ?, ?)', 'social-2', 'opening-social', waiting, 'CLAIMED'],
      ])

      expect(firstAiders(database, venue.id, night)).toEqual([{ firstName: 'Bea', roles: ['BAR'] }])
    })
  })
})

// The answer a duty manager gives when they claim rides the claim's own batch, behind the claim's
// own audit row, so only a claim that took the shift writes it (A-114, 0003, issue 1310).
describe('the duty manager\'s answer at the claim (issue 1310)', () => {
  function preference(database: TestDatabase, userId: string): number | undefined {
    return rows<{ visible: number }>(database, 'SELECT visible FROM shift_contact_preferences WHERE user_id = ?', userId)[0]?.visible
  }

  function open(database: TestDatabase, id: string, performanceId: string): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)', id, performanceId, 'DUTY_MANAGER', 'OPEN']])
  }

  // The duty manager's gate, held by every claimant here, so a claim is refused only over the shift.
  const DM_GATE = { moduleId: 'ADMN-201', today: '2026-10-12' }

  // The claim, its conditional audit row and the answer, batched as the route batches them.
  function claim(database: TestDatabase, shiftId: string, userId: string, visible: boolean): void {
    const auditId = `audit-${crypto.randomUUID()}`
    database.batch([
      ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
      ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'ADMN-201', 'ADMN', 'MODULE', 'Committee operations'],
      [`INSERT OR IGNORE INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, 'ADMN-201', '2025-09-01', 'SIGNOFF')`,
        `tr-dm-${userId}`, userId],
    ])
    database.batch([
      boundStatement(database, claimShiftStatement(shiftId, userId, 'CONFIRMED', DM_GATE)),
      [`INSERT INTO audit_log (id, actor_id, action, target, detail) SELECT ?, ?, 'shift.claimed', ?, '{}' WHERE changes() = 1`,
        auditId, userId, `shift:${shiftId}`],
      boundStatement(database, shareNumberStatement(auditId, userId, visible)),
    ])
  }

  test('written when the claim took the shift, and replaced by the answer at a later claim', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-asked')
      open(database, 'dm-open', tonight.performanceId)

      claim(database, 'dm-open', who, true)
      expect(preference(database, who)).toBe(1)

      database.batch([['UPDATE shifts SET status = ?, user_id = NULL WHERE id = ?', 'OPEN', 'dm-open']])
      claim(database, 'dm-open', who, false)
      expect(preference(database, who)).toBe(0)
    })
  })

  test('a claim that lost leaves the answer unwritten', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'dm-first')
      const second = person(database, 'dm-second')
      open(database, 'dm-contested', tonight.performanceId)

      claim(database, 'dm-contested', first, true)
      claim(database, 'dm-contested', second, true)
      expect(preference(database, second)).toBeUndefined()
    })
  })

  // A stale list on a second phone claims a shift already held: refused, so the first answer stands.
  test('re-claiming your own held shift leaves the earlier answer in place', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'dm-twice')
      open(database, 'dm-held', tonight.performanceId)

      claim(database, 'dm-held', who, true)
      claim(database, 'dm-held', who, false)
      expect(preference(database, who)).toBe(1)
    })
  })
})
