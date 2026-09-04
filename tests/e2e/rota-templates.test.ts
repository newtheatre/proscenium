import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-101, E-102 and E-106 through the real routes and the real screen. What the database refuses
// is pinned in `tests/integration/rota.test.ts`, against the same migrations.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let member: TestMember
let house: { venueId: string, showId: string, performanceId: string }
const fohPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'foh', fohPassword)
  member = await registerMember(app, 'ordinary', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  house = programme('house')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// Seed changes are closed after show night wave 1, so a venue to staff comes from tests/helpers.
function programme(suffix: string): { venueId: string, showId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
    return { venueId: made.venueId, showId: made.showId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

interface Listed { venueId: string, venueName: string, slots: { role: string, count: number }[] }

async function templates(as = admin.cookie): Promise<Listed[]> {
  const answer = await (await send('GET', '/api/admin/rota/templates', undefined, as)).json() as { venues: Listed[] }
  return answer.venues
}

function shiftsOn(performanceId: string): { role: string, slot: number, status: string, user_id: string | null }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database
      .query('SELECT role, slot, status, user_id FROM shifts WHERE performance_id = ? ORDER BY role, slot')
      .all(performanceId) as { role: string, slot: number, status: string, user_id: string | null }[]
  }
  finally {
    database.close()
  }
}

// A confirmed shift, which is the state E-104 will reach through the claim path in wave 2.
function claim(performanceId: string, userId: string): void {
  assign(performanceId, 'DUTY_MANAGER', userId, 'CONFIRMED')
}

// Any role in any of the states E-104 and E-107 will reach through the claim and confirm paths.
// Slot 1 only: a role with more than one slot must not name the same person on both.
function assign(performanceId: string, role: string, userId: string, status: string): void {
  const database = new Database(app.databaseFile)
  try {
    database
      .query(`UPDATE shifts SET user_id = ?, status = ?, claimed_at = unixepoch()
              WHERE performance_id = ? AND role = ? AND slot = 1`)
      .run(userId, status, performanceId, role)
  }
  finally {
    database.close()
  }
}

function notified(userId: string, type: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database
      .query('SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = ?')
      .get(userId, type) as { n: number }).n
  }
  finally {
    database.close()
  }
}

function trail(action: string, target: string): { detail: Record<string, unknown> } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT detail FROM audit_log WHERE action = ? AND target = ? ORDER BY created_at DESC')
      .get(action, target) as { detail: string } | null
    return row ? { detail: JSON.parse(row.detail) as Record<string, unknown> } : undefined
  }
  finally {
    database.close()
  }
}

const HOUSE_SLOTS = [
  { role: 'DUTY_MANAGER', count: 1 },
  { role: 'DOOR', count: 2 },
  { role: 'BAR', count: 1 },
]

describe.skipIf(skip !== null)('a venue template is the front of house officer\'s (E-101)', () => {
  test('the officer sets one up, and the change is on the trail with both states', async () => {
    const created = await send('PUT', `/api/admin/rota/templates/${house.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    expect(created.status).toBe(200)

    const found = (await templates(foh.cookie)).find(venue => venue.venueId === house.venueId)
    expect(found?.slots).toHaveLength(3)

    const entry = trail('shift-template.created', `venue:${house.venueId}`)
    expect(entry?.detail).toMatchObject({
      changes: { slots: { from: '', to: 'DUTY_MANAGER:1, DOOR:2, BAR:1' } },
    })
  })

  test('a change is recorded as one, with what it was before', async () => {
    await send('PUT', `/api/admin/rota/templates/${house.venueId}`, {
      slots: [{ role: 'DUTY_MANAGER', count: 1 }, { role: 'DOOR', count: 3 }, { role: 'BAR', count: 1 }],
    }, foh.cookie)

    expect(trail('shift-template.updated', `venue:${house.venueId}`)?.detail).toMatchObject({
      changes: { slots: { from: 'DUTY_MANAGER:1, DOOR:2, BAR:1', to: 'DUTY_MANAGER:1, DOOR:3, BAR:1' } },
    })

    await send('PUT', `/api/admin/rota/templates/${house.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
  })

  test('a template with no duty manager is refused, and says why (criterion 1)', async () => {
    const refused = await send('PUT', `/api/admin/rota/templates/${house.venueId}`, {
      slots: [{ role: 'DOOR', count: 2 }],
    }, foh.cookie)
    expect(refused.status).toBe(400)
    expect((await refused.json() as { message: string }).message).toContain('duty manager')
  })

  test('two duty managers are refused', async () => {
    const refused = await send('PUT', `/api/admin/rota/templates/${house.venueId}`, {
      slots: [{ role: 'DUTY_MANAGER', count: 2 }],
    }, foh.cookie)
    expect(refused.status).toBe(400)
  })

  test('a venue nobody has is a 404 rather than a template nothing stamps', async () => {
    expect((await send('PUT', '/api/admin/rota/templates/venue-nobody-has', { slots: HOUSE_SLOTS })).status).toBe(404)
  })

  test('an ordinary member reads and writes nothing here', async () => {
    expect((await send('GET', '/api/admin/rota/templates', undefined, member.cookie)).status).toBe(403)
    expect((await send('PUT', `/api/admin/rota/templates/${house.venueId}`, { slots: HOUSE_SLOTS }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a performance is stamped from its venue\'s template (E-102)', () => {
  test('adding a performance stamps one open shift per slot, naming nobody', async () => {
    const added = await send('POST', `/api/admin/shows/${house.showId}/performances`, {
      venueId: house.venueId,
      startsAt: Math.floor(Date.now() / 1000) + 14 * 86_400,
      intervalCount: 0,
    })
    expect(added.status).toBe(200)
    const { id } = await added.json() as { id: string }

    const stamped = shiftsOn(id)
    expect(stamped).toHaveLength(4)
    expect(stamped.every(shift => shift.status === 'OPEN' && shift.user_id === null)).toBe(true)
  })

  test('the backfill reaches a performance that was there before the template, and repeats safely', async () => {
    const first = await (await send('POST', `/api/admin/rota/templates/${house.venueId}/stamp`, {}, foh.cookie)).json() as { stamped: number }
    expect(first.stamped).toBeGreaterThan(0)
    expect(shiftsOn(house.performanceId)).toHaveLength(4)

    const again = await (await send('POST', `/api/admin/rota/templates/${house.venueId}/stamp`, {}, foh.cookie)).json() as { stamped: number }
    expect(again.stamped).toBe(0)
    expect(shiftsOn(house.performanceId)).toHaveLength(4)

    expect(trail('shift.stamped', `venue:${house.venueId}`)?.detail).toMatchObject({ venueId: house.venueId })
  })

  test('cancelling a performance cancels its rota (criterion 4)', async () => {
    const doomed = programme('doomed')
    await send('PUT', `/api/admin/rota/templates/${doomed.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('POST', `/api/admin/rota/templates/${doomed.venueId}/stamp`, {}, foh.cookie)
    expect(shiftsOn(doomed.performanceId)).toHaveLength(4)

    const cancelled = await send('POST', `/api/admin/performances/${doomed.performanceId}/cancel`)
    expect(cancelled.status).toBe(200)
    expect(shiftsOn(doomed.performanceId).every(shift => shift.status === 'CANCELLED')).toBe(true)
  })

  // A claim awaiting approval is owed the same count and the same word a confirmed shift is,
  // matching what the delete route's own refusal already promises.
  test('a cancellation counts and tells every claimed or confirmed holder, not only confirmed ones', async () => {
    const doomed = programme('claimed-doomed')
    await send('PUT', `/api/admin/rota/templates/${doomed.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('POST', `/api/admin/rota/templates/${doomed.venueId}/stamp`, {}, foh.cookie)
    assign(doomed.performanceId, 'DOOR', member.id, 'CLAIMED')

    const before = notified(member.id, 'shift.performance-cancelled')
    const cancelled = await send('POST', `/api/admin/performances/${doomed.performanceId}/cancel`)
    expect(cancelled.status).toBe(200)
    expect((await cancelled.json() as { shiftsCancelled: number }).shiftsCancelled).toBe(4)
    expect(notified(member.id, 'shift.performance-cancelled')).toBeGreaterThan(before)
  })

  // The invariant is "a performance is never staffed by nothing while its venue has a template",
  // and moving a house is the other way into that state.
  test('moving a performance to another venue restamps it from the new house', async () => {
    const from = programme('from')
    const to = programme('to')
    await send('PUT', `/api/admin/rota/templates/${to.venueId}`, {
      slots: [{ role: 'DUTY_MANAGER', count: 1 }, { role: 'DOOR', count: 1 }],
    }, foh.cookie)
    expect(shiftsOn(from.performanceId)).toHaveLength(0)

    const moved = await send('PUT', `/api/admin/performances/${from.performanceId}`, {
      venueId: to.venueId,
      startsAt: Math.floor(Date.now() / 1000) + 21 * 86_400,
      intervalCount: 0,
    })
    expect(moved.status).toBe(200)
    expect(shiftsOn(from.performanceId).map(shift => shift.role).sort()).toEqual(['DOOR', 'DUTY_MANAGER'])
  })

  // Matt, 4 September 2026: the shifts move, and the holder is told with a way out, rather than
  // being cancelled or left stranded on the old venue's slot.
  test('a held shift moves with the performance when the new house still staffs its role', async () => {
    const from = programme('holds-from')
    const to = programme('holds-to')
    await send('PUT', `/api/admin/rota/templates/${from.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('PUT', `/api/admin/rota/templates/${to.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('POST', `/api/admin/rota/templates/${from.venueId}/stamp`, {}, foh.cookie)
    claim(from.performanceId, member.id)

    const before = notified(member.id, 'shift.venue-changed')
    const moved = await send('PUT', `/api/admin/performances/${from.performanceId}`, {
      venueId: to.venueId,
      startsAt: Math.floor(Date.now() / 1000) + 22 * 86_400,
      intervalCount: 0,
    })
    expect(moved.status).toBe(200)

    const dutyManager = shiftsOn(from.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
    expect(dutyManager).toMatchObject({ status: 'CONFIRMED', user_id: member.id })
    expect(notified(member.id, 'shift.venue-changed')).toBeGreaterThan(before)
  })

  test('a held shift is cancelled, and its holder told, when the new house does not staff its role at all', async () => {
    const from = programme('orphan-from')
    const to = programme('orphan-to')
    await send('PUT', `/api/admin/rota/templates/${from.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('PUT', `/api/admin/rota/templates/${to.venueId}`, {
      slots: [{ role: 'DUTY_MANAGER', count: 1 }],
    }, foh.cookie)
    await send('POST', `/api/admin/rota/templates/${from.venueId}/stamp`, {}, foh.cookie)
    assign(from.performanceId, 'BAR', member.id, 'CONFIRMED')

    const before = notified(member.id, 'shift.role-not-needed')
    const moved = await send('PUT', `/api/admin/performances/${from.performanceId}`, {
      venueId: to.venueId,
      startsAt: Math.floor(Date.now() / 1000) + 23 * 86_400,
      intervalCount: 0,
    })
    expect(moved.status).toBe(200)

    const bar = shiftsOn(from.performanceId).find(shift => shift.role === 'BAR')
    expect(bar).toMatchObject({ status: 'CANCELLED', user_id: member.id })
    expect(notified(member.id, 'shift.role-not-needed')).toBeGreaterThan(before)
  })

  test('a performance whose shifts have been taken is cancelled, never deleted', async () => {
    const staffed = programme('staffed')
    await send('PUT', `/api/admin/rota/templates/${staffed.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    await send('POST', `/api/admin/rota/templates/${staffed.venueId}/stamp`, {}, foh.cookie)
    claim(staffed.performanceId, member.id)

    const refused = await send('DELETE', `/api/admin/performances/${staffed.performanceId}`)
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message: string }).message).toContain('cancelled')
    expect(shiftsOn(staffed.performanceId)).toHaveLength(4)
  })

  test('a venue with no template stamps nothing rather than failing (E-101 criterion 4)', async () => {
    const bare = programme('bare')
    expect(shiftsOn(bare.performanceId)).toHaveLength(0)
    expect((await send('POST', `/api/admin/rota/templates/${bare.venueId}/stamp`, {}, foh.cookie)).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('the screen the officer works from', () => {
  test('the front of house officer reaches it, sets a template up and stamps the diary', async () => {
    const fresh = programme('screen')
    const view = await visitAsFoh('/rota/manage/templates')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="edit-template-${fresh.venueId}"]')`)
      expect(await textOf(view, '[data-test="templates-table"]')).toContain('unstaffed')

      await click(view, `[data-test="edit-template-${fresh.venueId}"]`)
      await waitFor(view, '!!document.querySelector(\'[data-test="template-submit"]\')')
      await click(view, '[data-test="template-submit"]')

      await waitFor(view, `!!document.querySelector('[data-test="stamp-${fresh.venueId}"]')`)
      await click(view, `[data-test="stamp-${fresh.venueId}"]`)
      await waitFor(view, 'document.body.innerText.includes(\'now carry every slot\')')

      expect(shiftsOn(fresh.performanceId).length).toBeGreaterThan(0)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

async function visitAsFoh(path: string): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', foh.email)
  await fill(view, 'form input[type="password"]', fohPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  await visit(view, `${app.baseURL}${path}`, '[data-test="templates-table"]')
  return view
}
