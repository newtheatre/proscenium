import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight } from '#shared/utils/show-night'
import { NIGHT_VENUE_COOKIE } from '#shared/utils/night-venue'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { NightVenueOption } from '#shared/utils/night-venue'

// The hub's venue choice on a night two venues run (0230): the cookie narrows any guard that is
// not told a venue, and never widens one. Every case is a request, since the guard is what decides.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let foh: TestMember
let house: { venueId: string, performanceId: string }
let studio: { venueId: string, performanceId: string }
let dark: { venueId: string, performanceId: string }

const night = currentShowNight()

function programme(suffix: string, status: 'ON_SALE' | 'CANCELLED' = 'ON_SALE'): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix, status })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

let nextSlot = 300

function shiftFor(performanceId: string, role: string, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${performanceId}-${role}-${(nextSlot += 1)}`, performanceId, role, nextSlot, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  foh = await registerMember(app, 'venue-foh', generatePassword())
  await grantRole(app, foh, 'FOH_MANAGER', admin.cookie)

  house = programme('venue-house')
  studio = programme('venue-studio')
  dark = programme('venue-dark', 'CANCELLED')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const choosing = (venueId: string, onNight = night): string =>
  `${NIGHT_VENUE_COOKIE}=${encodeURIComponent(JSON.stringify({ night: onNight, venueId }))}`

const as = (member: TestMember, chosen?: string): string => (chosen ? `${member.cookie}; ${chosen}` : member.cookie)

const ask = (query: string, cookie: string): Promise<Response> =>
  request(app, 'GET', `/api/tonight/authority?${query}`, undefined, cookie)

interface Resolved { venueId: string, performanceIds: string[], via: string }

describe.skipIf(skip !== null)('the chosen venue narrows every show-night guard (0230)', () => {
  test('with nothing chosen the officer is still asked for the venue, and told where to choose it', async () => {
    const response = await ask('role=DOOR', as(foh))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { statusMessage: string }).statusMessage).toContain('Tonight hub')
  })

  test('the chosen venue answers the question for every role', async () => {
    for (const role of ['DOOR', 'DUTY_MANAGER']) {
      const response = await ask(`role=${role}`, as(foh, choosing(studio.venueId)))
      expect(response.status).toBe(200)
      const resolved = await response.json() as Resolved
      expect(resolved).toMatchObject({ venueId: studio.venueId, via: 'OFFICER' })
      expect(resolved.performanceIds).toEqual([studio.performanceId])
    }
  })

  test('a screen that reads with no role at all is narrowed too', async () => {
    const response = await request(app, 'GET', '/api/tonight/house', undefined, as(foh, choosing(house.venueId)))
    expect(response.status).toBe(200)
    const body = await response.json() as { venueId: string, performances: { performanceId: string }[] }
    expect(body.venueId).toBe(house.venueId)
    expect(body.performances.map(one => one.performanceId)).toEqual([house.performanceId])
  })

  test('a performance named on the request wins over the chosen venue', async () => {
    const resolved = await (await ask(`role=DOOR&performanceId=${house.performanceId}`, as(foh, choosing(studio.venueId)))).json() as Resolved
    expect(resolved.venueId).toBe(house.venueId)
  })

  test('last night\'s choice is no choice', async () => {
    expect((await ask('role=DOOR', as(foh, choosing(studio.venueId, '2020-01-01')))).status).toBe(400)
  })

  test('a venue running nothing tonight is ignored rather than refusing the night', async () => {
    expect((await ask('role=DOOR', as(foh, choosing(dark.venueId)))).status).toBe(400)
    expect((await ask('role=DOOR', as(foh, choosing('venue-nowhere')))).status).toBe(400)
  })

  test('a cookie that is not the shape is ignored', async () => {
    expect((await ask('role=DOOR', as(foh, `${NIGHT_VENUE_COOKIE}=not-json`))).status).toBe(400)
  })

  test('the till keeps its own remembered bar, so a bar-only request ignores the choice', async () => {
    expect((await ask('role=BAR', as(foh, choosing(studio.venueId)))).status).toBe(400)
  })

  test('a choice never widens: a door shift at one venue is refused at the other', async () => {
    const holder = await registerMember(app, 'venue-door', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)

    expect((await ask('role=DOOR', as(holder))).status).toBe(200)
    expect((await ask('role=DOOR', as(holder, choosing(studio.venueId)))).status).toBe(403)
  })

  test('a bar shift at one venue and a door shift at another resolve one venue each, as chosen', async () => {
    const holder = await registerMember(app, 'venue-two', generatePassword())
    shiftFor(house.performanceId, 'BAR', holder.id)
    shiftFor(studio.performanceId, 'DOOR', holder.id)

    expect((await ask('role=DOOR', as(holder, choosing(house.venueId)))).status).toBe(403)
    const atStudio = await (await ask('', as(holder, choosing(studio.venueId)))).json() as Resolved
    expect(atStudio).toMatchObject({ venueId: studio.venueId, via: 'SHIFT' })
  })
})

interface Venues { night: string, officer: boolean, chosenVenueId: string | null, venues: NightVenueOption[] }

describe.skipIf(skip !== null)('the hub lists tonight\'s venues to choose between (0230)', () => {
  test('the officer sees every running venue, and a cancelled one is not running', async () => {
    const response = await request(app, 'GET', '/api/tonight/venues', undefined, as(foh, choosing(studio.venueId)))
    expect(response.status).toBe(200)
    const body = await response.json() as Venues
    expect(body).toMatchObject({ night, officer: true, chosenVenueId: studio.venueId })
    const ids = body.venues.map(venue => venue.venueId)
    expect(ids).toContain(house.venueId)
    expect(ids).toContain(studio.venueId)
    expect(ids).not.toContain(dark.venueId)
  })

  test('a volunteer is told which venues their own shifts are at', async () => {
    const holder = await registerMember(app, 'venue-list', generatePassword())
    shiftFor(house.performanceId, 'BAR', holder.id)
    shiftFor(studio.performanceId, 'DOOR', holder.id)

    const body = await (await request(app, 'GET', '/api/tonight/venues', undefined, as(holder))).json() as Venues
    expect(body.officer).toBe(false)
    expect(body.chosenVenueId).toBeNull()
    expect(body.venues.filter(venue => venue.onShift).map(venue => venue.venueId).sort())
      .toEqual([house.venueId, studio.venueId].sort())
  })

  test('signed out, nothing is listed', async () => {
    expect((await request(app, 'GET', '/api/tonight/venues')).status).toBe(401)
  })
})
