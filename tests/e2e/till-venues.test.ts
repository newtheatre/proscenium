import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight } from '#shared/utils/show-night'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { TillVenueOption } from '#shared/utils/till'

// Which venue the till opens at, when the night does not answer it unaided (F-125, 0077). The
// picker is what a request naming no venue is answered with, so this is the list behind it.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let bar: TestMember
let member: TestMember
let claimant: TestMember
let house: { venueId: string, performanceId: string }

const night = currentShowNight()
const HIRE = 'venue-hire'
const DARK = 'venue-dark'

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  bar = await registerMember(app, 'till-venues-bar', generatePassword())
  member = await registerMember(app, 'till-venues-member', generatePassword())
  claimant = await registerMember(app, 'till-venues-claimant', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'venues-house' })
    house = { venueId: made.venueId, performanceId: made.performanceId }

    for (const [id, name] of [[HIRE, 'The Hire Room'], [DARK, 'The Dark Room']]) {
      database.query('INSERT OR IGNORE INTO venues (id, name, capacity) VALUES (?, ?, ?)').run(id, name, 60)
    }
    const opensAt = Math.floor(Date.now() / 1000) - 3600
    database.query(`INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at)
                    VALUES (?, ?, ?, ?, ?, ?)`)
      .run('opening-social', HIRE, night, 'A society social', opensAt, opensAt + 6 * 3600)
    // One slot worked and one only claimed: a queued claim is not yet a place to open a till.
    database.query('INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, ?, ?, ?)')
      .run('opening-social-1', 'opening-social', 1, member.id, 'CONFIRMED')
    database.query('INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, ?, ?, ?)')
      .run('opening-social-2', 'opening-social', 2, claimant.id, 'CLAIMED')
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function venuesFor(as?: string): Promise<TillVenueOption[]> {
  const response = await request(app, 'GET', '/api/till/venues', undefined, as)
  expect(response.status).toBe(200)
  return (await response.json() as { venues: TillVenueOption[] }).venues
}

describe.skipIf(skip !== null)('the till names the venues a caller may open one at (F-125)', () => {
  test('a venue running tonight is offered, named by the show rather than by its id', async () => {
    const offered = await venuesFor(member.cookie)
    const running = offered.find(venue => venue.venueId === house.venueId)
    expect(running).toBeDefined()
    expect(running!.what).toBe('A Test Show')
    expect(running!.venueName.length).toBeGreaterThan(0)
  })

  test('a venue where the caller works tonight\'s opening is offered, named by its label', async () => {
    const offered = await venuesFor(member.cookie)
    expect(offered.find(venue => venue.venueId === HIRE)?.what).toBe('A society social')
  })

  // The same fact the authority guard turns on: a claim awaiting approval is not authority.
  test('a queued claim on an opening offers nothing', async () => {
    expect((await venuesFor(claimant.cookie)).map(venue => venue.venueId)).not.toContain(HIRE)
  })

  // A venue with nothing on and nobody rostered is still somewhere the bar manager may open a
  // till: the hire the rota never covered is exactly the case 0077 exists for.
  test('a dark venue is offered to a night.till holder and to nobody else', async () => {
    expect((await venuesFor(bar.cookie)).map(venue => venue.venueId)).toContain(DARK)
    expect((await venuesFor(member.cookie)).map(venue => venue.venueId)).not.toContain(DARK)
  })

  test('a signed-out caller is told that, and nothing about tonight', async () => {
    expect((await request(app, 'GET', '/api/till/venues')).status).toBe(401)
  })
})
