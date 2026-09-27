import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import { currentShowNight, showNightOpensAt } from '#shared/utils/show-night'
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
let other: TestMember
let venueId: string
let barModuleId = ''
const fohPassword = generatePassword()

// A week out rather than tonight: the open-slot list and a member's own rota both filter on the
// clock, so an opening that has already run would drop out of a suite running late in the evening.
const night = daysAfter(currentShowNight(), 7)
const nightStart = showNightOpensAt(night)

interface Opening { openingId: string, venueId: string, label: string, status: string }
interface Slot { slotId: string, openingId: string, slot: number, status: string, holderName: string | null }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'openings-foh', fohPassword)
  member = await registerMember(app, 'openings-member', generatePassword())
  other = await registerMember(app, 'openings-other', generatePassword())
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

  // The bar gate names a module every claimant here holds, so a claim is refused only where a
  // test takes the training away (E-104, as rota-claim.test.ts sets its own gate).
  const department = `OPN${crypto.randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`
  expect((await request(app, 'POST', '/api/admin/training/departments', { code: department, name: 'Bar openings' }, admin.cookie)).status).toBe(200)
  barModuleId = `${department}-101`
  expect((await request(app, 'POST', '/api/admin/training/modules', {
    id: barModuleId, department, kind: 'MODULE', name: `Module ${barModuleId}`, status: 'ACTIVE',
  }, admin.cookie)).status).toBe(200)
  expect((await request(app, 'PUT', '/api/admin/config/SHIFT_ELIGIBILITY_BAR_MODULE', { value: barModuleId }, admin.cookie)).status).toBe(200)
  for (const claimant of [member, other]) award(claimant.id)
}, BOOT_TIMEOUT_MS)

// A current bar training record, awarded a month ago; the id lets a test revoke it.
function award(userId: string): string {
  const id = `tr-${crypto.randomUUID().slice(0, 8)}`
  const database = new Database(app.databaseFile)
  try {
    database.query(`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, 'SIGNOFF')`)
      .run(id, userId, barModuleId, daysAfter(currentShowNight(), -30))
  }
  finally {
    database.close()
  }
  return id
}

afterAll(async () => {
  await app?.stop()
}, 30_000)

// 18:00 to 23:00 on the night asked for, a week out unless a test says otherwise.
function plan(label: string, as: string, on = night): Promise<Response> {
  const from = showNightOpensAt(on)
  return request(app, 'POST', '/api/rota/openings', {
    venueId,
    night: on,
    label,
    startsAt: from + 14 * 3600,
    endsAt: from + 19 * 3600,
  }, as)
}

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
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)).status).toBe(200)

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

// E-130 criterion 3 with auto-confirm off: a claim on an opening queues, and the officer works it
// where the opening is staffed, as the board works a shift's (E-105 criteria 2 and 3).
describe.skipIf(skip !== null)('a queued claim is confirmed or declined (E-130 criterion 3)', () => {
  async function setAutoConfirm(value: boolean): Promise<void> {
    expect((await request(app, 'PUT', '/api/admin/config/SHIFT_CLAIM_AUTO_CONFIRM', { value }, admin.cookie)).status).toBe(200)
  }

  // Two queued claims on a fresh opening, one by each member.
  async function queued(label: string): Promise<{ opening: Opening, first: Slot, second: Slot }> {
    expect((await plan(label, foh.cookie)).status).toBe(200)
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === label)!
    const [first, second] = slots.filter(one => one.openingId === opening.openingId) as [Slot, Slot]
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${first.slotId}/claim`, {}, member.cookie)).status).toBe(200)
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${second.slotId}/claim`, {}, other.cookie)).status).toBe(200)
    const after = (await listing(foh.cookie)).slots.filter(one => one.openingId === opening.openingId)
    expect(after.map(one => one.status)).toEqual(['CLAIMED', 'CLAIMED'])
    return { opening, first, second }
  }

  const statusOf = async (slotId: string): Promise<string | undefined> =>
    (await listing(foh.cookie)).slots.find(one => one.slotId === slotId)?.status

  test('through the routes, one claim is confirmed once and another declined with its reason', async () => {
    await setAutoConfirm(false)
    try {
      const { first, second } = await queued('A queued hire')

      expect((await request(app, 'POST', `/api/rota/openings/shifts/${first.slotId}/approve`, {}, member.cookie)).status).toBe(403)
      expect((await request(app, 'POST', `/api/rota/openings/shifts/${first.slotId}/approve`, {}, foh.cookie)).status).toBe(200)
      expect((await request(app, 'POST', `/api/rota/openings/shifts/${first.slotId}/approve`, {}, foh.cookie)).status).toBe(409)
      expect(await statusOf(first.slotId)).toBe('CONFIRMED')

      const declined = await request(app, 'POST', `/api/rota/openings/shifts/${second.slotId}/decline`, { reason: 'Two on the bar is plenty that night' }, foh.cookie)
      expect(declined.status).toBe(200)
      expect(await statusOf(second.slotId)).toBe('DECLINED')
      const database = new Database(app.databaseFile, { readonly: true })
      try {
        const row = database.query('SELECT decline_reason AS reason FROM bar_opening_shifts WHERE id = ?').get(second.slotId) as { reason: string }
        expect(row.reason).toBe('Two on the bar is plenty that night')
      }
      finally {
        database.close()
      }
    }
    finally {
      await setAutoConfirm(true)
    }
  })

  // Issue 1302 through the opening's own route: a claimant whose bar training lapsed since is not
  // confirmed, and the refusal carries the decline reason the screen offers.
  test('a claim whose bar training lapsed since is refused, offering its decline reason', async () => {
    await setAutoConfirm(false)
    try {
      const lapsing = await registerMember(app, 'openings-lapsing', generatePassword())
      const recordId = award(lapsing.id)
      expect((await plan('A lapsed hire', foh.cookie)).status).toBe(200)
      const { items, slots } = await listing(foh.cookie)
      const opening = items.find(one => one.label === 'A lapsed hire')!
      const slot = slots.find(one => one.openingId === opening.openingId)!
      expect((await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, lapsing.cookie)).status).toBe(200)

      const database = new Database(app.databaseFile)
      try {
        database.query('UPDATE training_records SET revoked_at = unixepoch(), revoked_by = ?, revoke_reason = ? WHERE id = ?')
          .run(admin.id, 'Certificate not renewed', recordId)
      }
      finally {
        database.close()
      }

      const refused = await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/approve`, {}, foh.cookie)
      expect(refused.status).toBe(409)
      const body = await refused.json() as { statusMessage: string, data?: { declineReason?: string } }
      expect(body.statusMessage).toStartWith('No longer qualifies:')
      expect(body.data?.declineReason).toContain(`Module ${barModuleId}`)
      expect(await statusOf(slot.slotId)).toBe('CLAIMED')
    }
    finally {
      await setAutoConfirm(true)
    }
  })

  test('on the screen, Confirm confirms one and Decline asks the reason for the other', async () => {
    await setAutoConfirm(false)
    let view: Bun.WebView | null = null
    try {
      const { opening, first, second } = await queued('A screened hire')

      view = await openSignedOutView(app.baseURL)
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', foh.email)
      await fill(view, 'form input[type="password"]', fohPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rota/manage/openings`, `[data-test="confirm-${first.slotId}"]`)
      await click(view, `[data-test="confirm-${first.slotId}"]`)
      await waitFor(view, `!document.querySelector('[data-test="confirm-${first.slotId}"]')`)
      expect(await statusOf(first.slotId)).toBe('CONFIRMED')

      await click(view, `[data-test="decline-${second.slotId}"]`)
      await waitFor(view, `document.querySelector('[data-test="decline-reason"]')`)
      await fill(view, '[data-test="decline-reason"]', 'The hire asked for one on the bar')
      await click(view, '[data-test="confirm-decline-claim-verb"]')
      await waitFor(view, `!document.querySelector('[data-test="decline-${second.slotId}"]')`)
      expect(await statusOf(second.slotId)).toBe('DECLINED')
      expect(await textOf(view, `[data-test="staffing-${opening.openingId}"]`)).toContain('Declined')
    }
    finally {
      view?.close()
      await setAutoConfirm(true)
    }
  }, 120_000)
})

// E-107 criterion 1: a holder gives a slot back up to the start of its show night, and no later;
// past that it is the night's business, as it is for a shift.
describe.skipIf(skip !== null)('a holder releases their own slot until its night begins (E-107 criterion 1)', () => {
  test('a slot a week out is released, and one tonight is refused, naming why', async () => {
    const claimed = async (label: string, on: string): Promise<Slot> => {
      expect((await plan(label, foh.cookie, on)).status).toBe(200)
      const { items, slots } = await listing(foh.cookie)
      const opening = items.find(one => one.label === label)!
      const slot = slots.find(one => one.openingId === opening.openingId)!
      expect((await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)).status).toBe(200)
      return slot
    }

    const later = await claimed('A release next week', night)
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${later.slotId}/release`, {}, member.cookie)).status).toBe(200)

    const tonightSlot = await claimed('A release tonight', currentShowNight())
    const refused = await request(app, 'POST', `/api/rota/openings/shifts/${tonightSlot.slotId}/release`, {}, member.cookie)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('already begun')
    const held = (await listing(foh.cookie)).slots.find(one => one.slotId === tonightSlot.slotId)!
    expect(held.holderName).not.toBeNull()
  })
})

// E-107 criterion 2: a slot given back close to its night reaches the rota officers at once, as a
// shift's does; one given back further out waits for their digest.
describe.skipIf(skip !== null)('a release close to the night tells the rota officers at once (E-107 criterion 2)', () => {
  function releaseNotices(userId: string): number {
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const row = database.query(`SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.released'`).get(userId) as { n: number }
      return row.n
    }
    finally {
      database.close()
    }
  }

  async function claimedOn(label: string, on: string): Promise<Slot> {
    expect((await plan(label, foh.cookie, on)).status).toBe(200)
    const { items, slots } = await listing(foh.cookie)
    const opening = items.find(one => one.label === label)!
    const slot = slots.find(one => one.openingId === opening.openingId)!
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${slot.slotId}/claim`, {}, member.cookie)).status).toBe(200)
    return slot
  }

  test('a slot for tomorrow released tonight notifies the Front of House Manager, one ten days out does not', async () => {
    const before = releaseNotices(foh.id)
    const soon = await claimedOn('A release tomorrow', daysAfter(currentShowNight(), 1))
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${soon.slotId}/release`, {}, member.cookie)).status).toBe(200)
    expect(releaseNotices(foh.id)).toBe(before + 1)

    const far = await claimedOn('A release far out', daysAfter(currentShowNight(), 10))
    expect((await request(app, 'POST', `/api/rota/openings/shifts/${far.slotId}/release`, {}, member.cookie)).status).toBe(200)
    expect(releaseNotices(foh.id)).toBe(before + 1)
  })
})
