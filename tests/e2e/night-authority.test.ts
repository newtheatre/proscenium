import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight } from '#shared/utils/show-night'
import { daysAfter } from '#shared/utils/membership'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-111's officer branch through the real route (0044). The guard is what refuses, whatever the
// navigation shows, so every case here is a request and none of them is a screen.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let bar: TestMember
let member: TestMember
let house: { venueId: string, performanceId: string }
let studio: { venueId: string, performanceId: string }
let cancelled: { venueId: string, performanceId: string }

const night = currentShowNight()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'foh', generatePassword())
  bar = await registerMember(app, 'bar', generatePassword())
  member = await registerMember(app, 'ordinary', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)

  house = programme('house')
  studio = programme('studio')
  cancelled = programme('cancelled', 'CANCELLED')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// Seed changes closed after Wave 0, so a night to work comes from tests/helpers.
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

const ask = (query: string, as?: string): Promise<Response> =>
  request(app, 'GET', `/api/tonight/authority?${query}`, undefined, as)

interface Resolved { night: string, role: string, venueId: string, performanceIds: string[], via: string }

function bypasses(actorId: string): { target: string, detail: string }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database
      .query('SELECT target, detail FROM audit_log WHERE action = ? AND actor_id = ? ORDER BY target')
      .all('night.officer-bypass', actorId) as { target: string, detail: string }[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('an officer opens a show-night screen with no shift (E-111 criterion 4)', () => {
  test('the front of house officer resolves the door, and says it was by officer role', async () => {
    const response = await ask(`role=DOOR&performanceId=${house.performanceId}`, foh.cookie)
    expect(response.status).toBe(200)
    const resolved = await response.json() as Resolved
    expect(resolved).toMatchObject({ night, role: 'DOOR', venueId: house.venueId, via: 'OFFICER' })
    expect(resolved.performanceIds).toEqual([house.performanceId])
  })

  test('the bar manager resolves the till at a venue', async () => {
    const resolved = await (await ask(`role=BAR&venueId=${house.venueId}`, bar.cookie)).json() as Resolved
    expect(resolved.via).toBe('OFFICER')
    expect(resolved.performanceIds).toEqual([house.performanceId])
  })

  test('the use is recorded once however many times the screen is opened', async () => {
    for (let attempt = 0; attempt < 3; attempt++) await ask(`role=DOOR&venueId=${house.venueId}`, foh.cookie)
    const written = bypasses(foh.id).filter(row => row.target.endsWith(`:${house.venueId}:DOOR`))
    expect(written.length).toBe(1)
    expect(JSON.parse(written[0]!.detail)).toMatchObject({ role: 'DOOR', night, venueId: house.venueId })
  })

  // The lead's question, answered: without the venue in the key the second venue's night report
  // would show nothing (0044).
  test('a second venue on the same night is recorded separately', async () => {
    await ask(`role=DOOR&venueId=${studio.venueId}`, foh.cookie)
    const targets = bypasses(foh.id).map(row => row.target)
    expect(targets).toContain(`night:${night}:${house.venueId}:DOOR`)
    expect(targets).toContain(`night:${night}:${studio.venueId}:DOOR`)
  })

  test('a second role at the same venue is recorded separately', async () => {
    await ask(`role=DUTY_MANAGER&venueId=${house.venueId}`, foh.cookie)
    expect(bypasses(foh.id).map(row => row.target)).toContain(`night:${night}:${house.venueId}:DUTY_MANAGER`)
  })
})

describe.skipIf(skip !== null)('the roles are not interchangeable (E-111 criterion 1, F-101 criterion 2)', () => {
  test('the front of house officer does not open the till', async () => {
    const response = await ask(`role=BAR&venueId=${house.venueId}`, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('bar manager')
  })

  test('the bar manager opens neither the door nor the duty manager screens', async () => {
    for (const role of ['DOOR', 'DUTY_MANAGER']) {
      expect((await ask(`role=${role}&venueId=${house.venueId}`, bar.cookie)).status).toBe(403)
    }
  })

  test('a refused officer is not recorded as having bypassed anything', async () => {
    expect(bypasses(bar.id).filter(row => row.target.endsWith(':DOOR'))).toEqual([])
  })
})

describe.skipIf(skip !== null)('the guard is the enforcement, not the navigation (E-111 criterion 5)', () => {
  test('an ordinary member is refused, and told what would unlock it', async () => {
    const response = await ask(`role=DOOR&venueId=${house.venueId}`, member.cookie)
    expect(response.status).toBe(403)
    const refusal = await message(response)
    expect(refusal).toContain('DOOR')
    expect(refusal).toContain('front of house')
  })

  test('a signed-out caller gets no further', async () => {
    expect((await ask(`role=DOOR&venueId=${house.venueId}`)).status).toBe(401)
  })

  // Identity is resolved first, so which refusal comes back never says what tonight is.
  test('a signed-out caller naming a night is told they are signed out, and nothing else', async () => {
    expect((await ask(`role=DOOR&venueId=${house.venueId}&night=${daysAfter(night, -1)}`)).status).toBe(401)
  })

  test('an unknown role is refused as a bad request, not resolved to nothing', async () => {
    expect((await ask(`role=USHER&venueId=${house.venueId}`, foh.cookie)).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('authority covers tonight and expires with it (E-111 criterion 2)', () => {
  test('last night is refused, whatever the officer holds', async () => {
    const response = await ask(`role=DOOR&venueId=${house.venueId}&night=${daysAfter(night, -1)}`, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('tonight')
  })

  test('tomorrow is refused too: it is not a longer window, it is the same one', async () => {
    expect((await ask(`role=DOOR&venueId=${house.venueId}&night=${daysAfter(night, 1)}`, foh.cookie)).status).toBe(403)
  })

  test('naming tonight explicitly resolves, so a screen may send the night it is showing', async () => {
    expect((await ask(`role=DOOR&venueId=${house.venueId}&night=${night}`, foh.cookie)).status).toBe(200)
  })

  test('a night that is not a night at all is a bad request', async () => {
    expect((await ask(`role=DOOR&venueId=${house.venueId}&night=2026-02-30`, foh.cookie)).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('authority keys to a performance, never to a day (E-127 criterion 1)', () => {
  test('a venue running nothing tonight resolves no authority', async () => {
    const response = await ask('role=DOOR&venueId=venue-nobody-uses', foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('running')
  })

  test('a performance that is not on tonight resolves nothing, even at a venue that is', async () => {
    const response = await ask('role=DOOR&performanceId=performance-nobody-runs', foh.cookie)
    expect(response.status).toBe(403)
  })

  // The house never opens, so nothing derives from it and no bypass is recorded against it.
  test('a cancelled performance is not a night to take charge of', async () => {
    const response = await ask(`role=DOOR&venueId=${cancelled.venueId}`, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('running')
    expect(bypasses(foh.id).map(row => row.target)).not.toContain(`night:${night}:${cancelled.venueId}:DOOR`)
  })

  test('naming the cancelled performance itself resolves nothing either', async () => {
    expect((await ask(`role=DOOR&performanceId=${cancelled.performanceId}`, foh.cookie)).status).toBe(403)
  })

  // Three venues run tonight, so an unnarrowed request cannot say which one it covers.
  test('an unnarrowed request on a two-venue night asks for the venue', async () => {
    const response = await ask('role=DOOR', foh.cookie)
    expect(response.status).toBe(400)
    expect(await message(response)).toContain('venue')
  })
})

let nextSlot = 100

function shiftFor(performanceId: string, role: string, userId: string, status = 'CONFIRMED'): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-${role}-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, role, nextSlot, userId, status)
    return id
  }
  finally {
    database.close()
  }
}

function setShiftStatus(shiftId: string, status: string, userId: string | null): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('UPDATE shifts SET status = ?, user_id = ? WHERE id = ?').run(status, userId, shiftId)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a confirmed shift is tonight\'s authority, tried before the officer bypass (E-111 criterion 1, 0044)', () => {
  test('the shift holder resolves the door with no officer role at all', async () => {
    const holder = await registerMember(app, 'door-shift', generatePassword())
    const shiftId = shiftFor(house.performanceId, 'DOOR', holder.id)

    const response = await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)
    expect(response.status).toBe(200)
    const resolved = await response.json() as Resolved & { shiftId: string }
    expect(resolved).toMatchObject({ night, role: 'DOOR', venueId: house.venueId, via: 'SHIFT', shiftId })
    expect(resolved.performanceIds).toEqual([house.performanceId])
  })

  // A DOOR shift is not authority over the till, so it falls through to the officer check, and
  // an ordinary member holds none of those either (E-111 criterion 1, F-101 criterion 2).
  test('a door shift does not open the till', async () => {
    const holder = await registerMember(app, 'door-not-bar', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)

    const response = await ask(`role=BAR&performanceId=${house.performanceId}`, holder.cookie)
    expect(response.status).toBe(403)
  })

  // The shift covers one performance, so naming a different one it does not name is a request
  // the shift cannot answer, and there is no officer role to fall back to either.
  test('a shift does not open a performance it was never confirmed on', async () => {
    const holder = await registerMember(app, 'door-elsewhere', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)

    const response = await ask(`role=DOOR&performanceId=${studio.performanceId}`, holder.cookie)
    expect(response.status).toBe(403)
  })

  test('a claimed but unconfirmed shift is not yet authority', async () => {
    const claimant = await registerMember(app, 'door-claimed', generatePassword())
    shiftFor(house.performanceId, 'DOOR', claimant.id, 'CLAIMED')

    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, claimant.cookie)).status).toBe(403)
  })

  // Losing the shift loses the authority on the very next request, not at next login
  // (E-111 criterion 3).
  test('a released shift stops resolving on the next request', async () => {
    const holder = await registerMember(app, 'door-released', generatePassword())
    const shiftId = shiftFor(house.performanceId, 'DOOR', holder.id)

    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)).status).toBe(200)
    setShiftStatus(shiftId, 'OPEN', null)
    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)).status).toBe(403)
  })

  test('a reassigned shift resolves for its new holder and not its old one', async () => {
    const outgoing = await registerMember(app, 'door-outgoing', generatePassword())
    const incoming = await registerMember(app, 'door-incoming', generatePassword())
    const shiftId = shiftFor(house.performanceId, 'DOOR', outgoing.id)

    setShiftStatus(shiftId, 'CONFIRMED', incoming.id)
    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, outgoing.cookie)).status).toBe(403)
    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, incoming.cookie)).status).toBe(200)
  })

  // A shift resolution writes no bypass row: the rota's own `shift.claimed` and `shift.confirmed`
  // entries are already the record of how the account came to hold it (0044).
  test('a shift resolution is not recorded as an officer bypass', async () => {
    const holder = await registerMember(app, 'door-no-bypass', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)

    await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)
    expect(bypasses(holder.id)).toEqual([])
  })

  // Two confirmed shifts of the same role on the same night, at two different venues, is exactly
  // the ambiguity an unnarrowed officer request refuses (E-127 criterion 1).
  test('two confirmed shifts at two venues with nothing to narrow it asks for the venue', async () => {
    const holder = await registerMember(app, 'door-both-venues', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)
    shiftFor(studio.performanceId, 'DOOR', holder.id)

    const response = await ask('role=DOOR', holder.cookie)
    expect(response.status).toBe(400)
    expect(await message(response)).toContain('venue')
  })

  test('naming the venue resolves the one shift that covers it', async () => {
    const holder = await registerMember(app, 'door-narrowed', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)
    shiftFor(studio.performanceId, 'DOOR', holder.id)

    const resolved = await (await ask(`role=DOOR&venueId=${house.venueId}`, holder.cookie)).json() as Resolved
    expect(resolved).toMatchObject({ via: 'SHIFT', venueId: house.venueId })
    expect(resolved.performanceIds).toEqual([house.performanceId])
  })
})

// A venue with nothing on tonight, the evening 0077 exists for: an external hire, a society
// social or a get-in, where money is taken and the bar is staffed but no house opens.
function hireVenue(): string {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT OR IGNORE INTO venues (id, name, capacity) VALUES (?, ?, ?)').run('venue-hire', 'The Hire Room', 80)
    return 'venue-hire'
  }
  finally {
    database.close()
  }
}

let nextOpening = 0

function barOpening(venueId: string, status = 'PLANNED'): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `opening-${(nextOpening += 1)}`
    const opensAt = Math.floor(Date.now() / 1000) - 3600
    database.query(`INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, venueId, night, 'A society social', opensAt, opensAt + 6 * 3600, status)
    return id
  }
  finally {
    database.close()
  }
}

let nextOpeningSlot = 0

function openingSlot(openingId: string, userId: string, status = 'CONFIRMED'): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `${openingId}-slot-${(nextOpeningSlot += 1)}`
    database.query('INSERT INTO bar_opening_shifts (id, opening_id, slot, user_id, status) VALUES (?, ?, ?, ?, ?)')
      .run(id, openingId, nextOpeningSlot, userId, status)
    return id
  }
  finally {
    database.close()
  }
}

function setShiftWindow(shiftId: string, startsAt: number, endsAt: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('UPDATE shifts SET starts_at = ?, ends_at = ? WHERE id = ?').run(startsAt, endsAt, shiftId)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the bar opens on a night with nothing running (F-125, E-130, 0077)', () => {
  test('a confirmed slot on tonight\'s opening resolves the till, and names no performance', async () => {
    const venueId = hireVenue()
    const holder = await registerMember(app, 'opening-bar', generatePassword())
    const openingId = barOpening(venueId)
    const slotId = openingSlot(openingId, holder.id)

    const response = await ask(`role=BAR&venueId=${venueId}`, holder.cookie)
    expect(response.status).toBe(200)
    const resolved = await response.json() as Resolved & { shiftId: string, openingId: string }
    expect(resolved).toMatchObject({ night, role: 'BAR', venueId, via: 'SHIFT', shiftId: slotId, openingId })
    expect(resolved.performanceIds).toEqual([])
  })

  test('a queued claim on an opening is not authority, and neither is a cancelled opening', async () => {
    const venueId = hireVenue()
    const claimant = await registerMember(app, 'opening-claimed', generatePassword())
    openingSlot(barOpening(venueId), claimant.id, 'CLAIMED')
    expect((await ask(`role=BAR&venueId=${venueId}`, claimant.cookie)).status).toBe(403)

    const stoodDown = await registerMember(app, 'opening-cancelled', generatePassword())
    openingSlot(barOpening(venueId, 'CANCELLED'), stoodDown.id)
    expect((await ask(`role=BAR&venueId=${venueId}`, stoodDown.cookie)).status).toBe(403)
  })

  // The bar manager's own way in on a hire the rota never covered: the venue is what stands in
  // for the performance, and the bypass records that there was none.
  test('the bar manager opens the till at a named venue with nothing running, and it is recorded', async () => {
    const venueId = hireVenue()
    const response = await ask(`role=BAR&venueId=${venueId}`, bar.cookie)
    expect(response.status).toBe(200)
    const resolved = await response.json() as Resolved
    expect(resolved).toMatchObject({ venueId, via: 'OFFICER' })
    expect(resolved.performanceIds).toEqual([])

    const written = bypasses(bar.id).filter(row => row.target.endsWith(`:${venueId}:BAR`))
    expect(written.length).toBe(1)
    expect(JSON.parse(written[0]!.detail)).toMatchObject({ role: 'BAR', night, venueId, performanceIds: [] })
  })

  test('the bar manager naming no venue at all is asked for one rather than refused', async () => {
    const response = await ask('role=BAR', bar.cookie)
    expect(response.status).toBe(400)
    expect(await message(response)).toContain('venue')
  })

  // There is no house to work, so the door and the duty manager keep the refusal they had.
  test('the door and the duty manager are still refused where nothing is running', async () => {
    const venueId = hireVenue()
    for (const role of ['DOOR', 'DUTY_MANAGER']) {
      const response = await ask(`role=${role}&venueId=${venueId}`, foh.cookie)
      expect(response.status).toBe(403)
      expect(await message(response)).toContain('running')
    }
  })

  test('an ordinary member is refused, and told the opening is a way in as well', async () => {
    const venueId = hireVenue()
    const response = await ask(`role=BAR&venueId=${venueId}`, member.cookie)
    expect(response.status).toBe(403)
    const refusal = await message(response)
    expect(refusal).toContain('bar opening')
    expect(refusal).toContain('bar manager')
  })
})

describe.skipIf(skip !== null)('a shift is authority inside its own window (E-131 criterion 4, 0078)', () => {
  test('a holder before their window is refused, and the refusal quotes the window', async () => {
    const holder = await registerMember(app, 'door-too-early', generatePassword())
    const shiftId = shiftFor(house.performanceId, 'DOOR', holder.id)
    const now = Math.floor(Date.now() / 1000)
    // Well clear of the configured grace at both ends, so the case is the window and not it.
    setShiftWindow(shiftId, now + 6 * 3600, now + 9 * 3600)

    const response = await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toMatch(/\d\d:\d\d to \d\d:\d\d/)
  })

  test('the same holder inside the window resolves, by shift', async () => {
    const holder = await registerMember(app, 'door-in-window', generatePassword())
    const shiftId = shiftFor(house.performanceId, 'DOOR', holder.id)
    const now = Math.floor(Date.now() / 1000)
    setShiftWindow(shiftId, now - 1800, now + 1800)

    const resolved = await (await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)).json() as Resolved
    expect(resolved).toMatchObject({ via: 'SHIFT', venueId: house.venueId })
  })

  // A shift stamped before shifts had windows bounds nobody: an unknown window is not evidence
  // of being off shift (0078).
  test('a shift with no window stamped still resolves', async () => {
    const holder = await registerMember(app, 'door-no-window', generatePassword())
    shiftFor(house.performanceId, 'DOOR', holder.id)

    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, holder.cookie)).status).toBe(200)
  })

  // The officer's way in is a standing grant being used, not a shift, so no window bounds it.
  test('the officer bypass is unaffected by any window', async () => {
    expect((await ask(`role=DOOR&performanceId=${house.performanceId}`, foh.cookie)).status).toBe(200)
  })
})

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}
