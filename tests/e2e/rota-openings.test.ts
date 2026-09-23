import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { daysAfter } from '#shared/utils/membership'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-130 end to end: an evening with no performance is planned, staffed, claimed, confirmed and
// cancelled through the real routes (0077). The screen is the officer's; the guard is the route's.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let member: TestMember
let venueId: string

// A week out rather than tonight: the open-slot list and a member's own rota both filter on the
// clock, so an opening that has already run would drop out of a suite running late in the evening.
const night = daysAfter(currentShowNight(), 7)
const nightStart = Math.floor(showNightBounds(night).from.getTime() / 1000)

interface Opening { openingId: string, venueId: string, label: string, status: string }
interface Slot { slotId: string, openingId: string, slot: number, status: string, holderName: string | null }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'openings-foh', generatePassword())
  member = await registerMember(app, 'openings-member', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    venueId = testVenue(sqliteTarget(database), { suffix: 'openings', name: 'The Hire Room' }).id
    // Two bar slots and the duty manager every template carries, so planning stamps two.
    for (const [role, count] of [['DUTY_MANAGER', 1], ['BAR', 2]] as const) {
      database.query('INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)')
        .run(`tpl-openings-${role}`, venueId, role, count)
    }
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const plan = (label: string, as: string): Promise<Response> =>
  request(app, 'POST', '/api/rota/openings', {
    venueId,
    night,
    label,
    startsAt: nightStart + 14 * 3600,
    endsAt: nightStart + 19 * 3600,
  }, as)

async function listing(as: string): Promise<{ items: Opening[], slots: Slot[] }> {
  const response = await request(app, 'GET', '/api/rota/openings', undefined, as)
  expect(response.status).toBe(200)
  return await response.json() as { items: Opening[], slots: Slot[] }
}

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

describe.skipIf(skip !== null)('an officer plans an evening with no performance (E-130 criteria 1 and 2)', () => {
  test('planning one stamps a bar slot per head of the venue template', async () => {
    const response = await plan('A society social', foh.cookie)
    expect(response.status).toBe(200)
    expect(await response.json() as { stamped: number }).toMatchObject({ stamped: 2 })

    const { items, slots } = await listing(foh.cookie)
    const planned = items.find(opening => opening.label === 'A society social')
    expect(planned).toMatchObject({ venueId, status: 'PLANNED' })
    const stamped = slots.filter(slot => slot.openingId === planned!.openingId)
    expect(stamped.map(slot => slot.slot)).toEqual([1, 2])
    expect(stamped.every(slot => slot.status === 'OPEN' && slot.holderName === null)).toBe(true)
  })

  test('a venue with no bar row in its template is told so, and nothing is planned', async () => {
    const database = new Database(app.databaseFile)
    let bare: string
    try {
      bare = testVenue(sqliteTarget(database), { suffix: 'openings-bare', name: 'The Bare Room' }).id
    }
    finally {
      database.close()
    }

    const response = await request(app, 'POST', '/api/rota/openings', {
      venueId: bare,
      night,
      label: 'A hire nobody staffs',
      startsAt: nightStart + 14 * 3600,
      endsAt: nightStart + 19 * 3600,
    }, foh.cookie)

    expect(response.status).toBe(409)
    expect(await message(response)).toContain('bar row')
    expect((await listing(foh.cookie)).items.find(opening => opening.venueId === bare)).toBeUndefined()
  })

  test('an ordinary member cannot plan one', async () => {
    expect((await plan('A social nobody asked for', member.cookie)).status).toBe(403)
  })

  test('the database refuses an opening that closes before it opens', async () => {
    const response = await request(app, 'POST', '/api/rota/openings', {
      venueId,
      night,
      label: 'A bar that shuts first',
      startsAt: nightStart + 19 * 3600,
      endsAt: nightStart + 14 * 3600,
    }, foh.cookie)
    expect(response.status).toBe(400)
  })
})

describe.skipIf(skip !== null)('a slot is claimed and confirmed like any other (E-130 criteria 3 and 4)', () => {
  test('a member claims a slot, and it lands on their own rota labelled by the opening', async () => {
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A society social')!
    const slot = slots.find(one => one.openingId === opening.openingId && one.status === 'OPEN')!

    const claimed = await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)
    expect(claimed.status).toBe(200)

    // Auto-confirm decides whether it is confirmed outright or queued; either way it is theirs.
    const mine = await (await request(app, 'GET', '/api/rota/mine', undefined, member.cookie)).json() as {
      openings: { slotId: string, label: string, venueName: string }[]
    }
    const held = mine.openings.find(one => one.slotId === slot.slotId)
    expect(held).toBeDefined()
    expect(held!.label).toBe('A society social')
    expect(held!.venueName).toBe('The Hire Room')
  })

  test('one person holds one slot on an opening', async () => {
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A society social')!
    const other = slots.find(one => one.openingId === opening.openingId && one.status === 'OPEN')!

    const second = await request(app, 'POST', `/api/rota/openings/shifts/${other.slotId}/claim`, {}, member.cookie)
    expect(second.status).toBe(409)
    expect(await message(second)).toContain('already hold')
  })

  test('the open-slot list offers an opening beside the rota\'s own open shifts', async () => {
    const open = await (await request(app, 'GET', '/api/rota/shifts', undefined, member.cookie)).json() as {
      openings: { slotId: string, label: string, venueName: string }[]
    }
    expect(open.openings.some(one => one.label === 'A society social')).toBe(true)
  })

  test('an officer stands somebody down, and the slot names nobody again', async () => {
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A society social')!
    const held = slots.find(one => one.openingId === opening.openingId && one.holderName !== null)!

    expect((await request(app, 'POST', `/api/rota/openings/shifts/${held.slotId}/unconfirm`, {}, foh.cookie)).status).toBe(200)

    const after = (await listing(foh.cookie)).slots.find(one => one.slotId === held.slotId)!
    expect(after).toMatchObject({ status: 'OPEN', holderName: null })
  })
})

describe.skipIf(skip !== null)('an opening\'s staffing changes one-off (E-130 criterion 7)', () => {
  async function quizNight(): Promise<{ opening: Opening, slots: Slot[] }> {
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A quiz night')!
    return { opening, slots: slots.filter(one => one.openingId === opening.openingId) }
  }

  test('an officer adds a slot, and the venue template keeps its count', async () => {
    expect((await plan('A quiz night', foh.cookie)).status).toBe(200)
    const { opening } = await quizNight()

    const added = await request(app, 'POST', `/api/rota/openings/${opening.openingId}/slots`, {}, foh.cookie)
    expect(added.status).toBe(200)
    expect(await added.json() as { slot: number }).toMatchObject({ slot: 3 })

    expect((await quizNight()).slots.map(slot => slot.slot)).toEqual([1, 2, 3])
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const row = database.query(`SELECT "count" AS count FROM shift_templates WHERE venue_id = ? AND role = 'BAR'`)
        .get(venueId) as { count: number }
      expect(row.count).toBe(2)
    }
    finally {
      database.close()
    }
  })

  test('an ordinary member can neither add a slot nor remove one', async () => {
    const { opening, slots } = await quizNight()
    expect((await request(app, 'POST', `/api/rota/openings/${opening.openingId}/slots`, {}, member.cookie)).status).toBe(403)
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${slots[0]!.slotId}/remove`, {}, member.cookie)).status).toBe(403)
  })

  test('a slot somebody holds is refused, and says to stand them down first', async () => {
    const { slots } = await quizNight()
    const slot = slots[0]!
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)).status).toBe(200)

    const refused = await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/remove`, {}, foh.cookie)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('stand them down first')
    expect((await quizNight()).slots.some(one => one.slotId === slot.slotId)).toBe(true)
  })

  test('an open slot is removed, and the change is audited against the opening', async () => {
    const { opening, slots } = await quizNight()
    const open = slots.filter(one => one.status === 'OPEN')
    const removing = open[open.length - 1]!

    const removed = await request(app, 'POST', `/api/rota/openings/shifts/${removing.slotId}/remove`, {}, foh.cookie)
    expect(removed.status).toBe(200)
    expect((await quizNight()).slots.some(one => one.slotId === removing.slotId)).toBe(false)

    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const entries = database.query('SELECT action, detail FROM audit_log WHERE target = ? ORDER BY created_at')
        .all(`bar-opening:${opening.openingId}`) as { action: string, detail: string }[]
      const added = entries.find(row => row.action === 'bar-opening-shift.added')!
      const removed = entries.find(row => row.action === 'bar-opening-shift.removed')!
      // Both name the slot by id and by number, since a number is reused once the highest goes.
      expect(JSON.parse(added.detail).changes).toMatchObject({ slot: { from: null, to: 3 } })
      expect(JSON.parse(added.detail).changes.slotId.to).toEqual(expect.any(String))
      expect(JSON.parse(removed.detail).changes).toEqual({
        slotId: { from: removing.slotId, to: null },
        slot: { from: removing.slot, to: null },
      })
    }
    finally {
      database.close()
    }
  })

  test('removing the same slot twice is refused rather than recorded twice', async () => {
    const { slots } = await quizNight()
    const open = slots.find(one => one.status === 'OPEN')!
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${open.slotId}/remove`, {}, foh.cookie)).status).toBe(200)
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${open.slotId}/remove`, {}, foh.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('cancelling one cancels its slots (E-130 criterion 5)', () => {
  test('whoever held a slot keeps their name on it, and the opening is cancelled', async () => {
    expect((await plan('A get-in', foh.cookie)).status).toBe(200)
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A get-in')!
    const slot = slots.find(one => one.openingId === opening.openingId)!
    await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)

    const cancelled = await request(app, 'POST', `/api/rota/openings/${opening.openingId}/cancel`, {}, foh.cookie)
    expect(cancelled.status).toBe(200)

    const after = await listing(foh.cookie)
    expect(after.items.find(one => one.openingId === opening.openingId)?.status).toBe('CANCELLED')
    const held = after.slots.find(one => one.slotId === slot.slotId)!
    expect(held.status).toBe('CANCELLED')
    expect(held.holderName).not.toBeNull()
  })

  test('cancelling it twice is refused rather than recorded twice', async () => {
    const { items } = await listing(foh.cookie)
    const opening = items.find(one => one.label === 'A get-in')!
    expect((await request(app, 'POST', `/api/rota/openings/${opening.openingId}/cancel`, {}, foh.cookie)).status).toBe(409)
  })

  test('a cancelled opening is off the claimant\'s own rota', async () => {
    const mine = await (await request(app, 'GET', '/api/rota/mine', undefined, member.cookie)).json() as {
      openings: { label: string }[]
    }
    expect(mine.openings.some(one => one.label === 'A get-in')).toBe(false)
  })
})
