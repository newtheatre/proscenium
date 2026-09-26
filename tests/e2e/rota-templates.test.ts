import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, markVerified, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride } from '#tests/helpers/config'
import { tonightsPerformance } from '#tests/helpers/programme'
import { daysAfter } from '#shared/utils/membership'
import { currentShowNight } from '#shared/utils/show-night'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
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
let gatingModule = ''
const fohPassword = generatePassword()

// A browser session needs a known password and its own confirmed factor: the API session
// `adminSession()` returns never leaves the process, so it cannot drive a sign-in form.
const adminBrowserPassword = generatePassword()
const adminBrowser = { ...syntheticPerson(83), email: registrableAddress('templates-admin') }
let adminBrowserSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'foh', fohPassword)
  member = await registerMember(app, 'ordinary', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  house = programme('house')

  await request(app, 'POST', '/api/auth/register', { email: adminBrowser.email, name: adminBrowser.name, password: adminBrowserPassword })
  markVerified(app, adminBrowser.email)
  const first = await request(app, 'POST', '/api/auth/sign-in', { email: adminBrowser.email, password: adminBrowserPassword })
  const firstCookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!
  adminBrowserSecret = (await (await request(app, 'POST', '/api/account/mfa/enrol', {}, firstCookie)).json() as { secret: string }).secret
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(adminBrowserSecret, stepFor(new Date())) }, firstCookie)
  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', adminBrowser.email, app.databaseFile]).exitCode).toBe(0)

  const department = `ROT${crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`
  await request(app, 'POST', '/api/admin/training/departments', { code: department, name: 'Rota gating' }, admin.cookie)
  gatingModule = `${department}-BAR`
  await request(app, 'POST', '/api/admin/training/modules', {
    id: gatingModule,
    department,
    kind: 'MODULE',
    name: 'Bar service',
    status: 'ACTIVE',
  }, admin.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// Seed changes are closed after show night wave 1, so a venue to staff comes from tests/helpers.
function programme(suffix: string): { venueId: string, showId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId, showId: made.showId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

// A second night at a venue already in use, holding one hand-added shift and no more.
function partlyStaffedAt(venueId: string, suffix: string): string {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix, venueId, night: daysAfter(currentShowNight(), 2) })
    database.query('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID().replaceAll('-', ''), made.performanceId, 'DUTY_MANAGER', 1, 'OPEN')
    return made.performanceId
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

  test('a venue marked external loses its template, is not listed, is refused a template and a stamp, and takes shifts by hand (issue 1210)', async () => {
    const away = programme('external')
    await send('PUT', `/api/admin/rota/templates/${away.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    const marked = await send('PUT', `/api/admin/reference-data/venues/${away.venueId}`, {
      name: 'The Test House external', capacity: 120, isExternal: true,
    })
    expect(marked.status).toBe(200)
    expect(trail('shift-template.removed', `venue:${away.venueId}`)?.detail).toMatchObject({ reason: 'external' })
    // The template went with the flag, so nothing holds the venue open for deletion.
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      expect(database.query('SELECT 1 FROM shift_templates WHERE venue_id = ?').all(away.venueId)).toEqual([])
    }
    finally {
      database.close()
    }

    expect((await templates(foh.cookie)).map(venue => venue.venueId)).not.toContain(away.venueId)

    const set = await send('PUT', `/api/admin/rota/templates/${away.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    expect(set.status).toBe(409)
    expect((await set.json() as { statusMessage: string }).statusMessage).toContain('rota board')

    const stamp = await send('POST', `/api/admin/rota/templates/${away.venueId}/stamp`, {}, foh.cookie)
    expect(stamp.status).toBe(409)
    expect((await stamp.json() as { statusMessage: string }).statusMessage).toContain('rota board')

    const added = await send('POST', '/api/admin/rota/shifts/add', {
      performanceId: away.performanceId, role: 'DUTY_MANAGER', slot: 1,
    }, foh.cookie)
    expect(added.status).toBe(200)
    expect(shiftsOn(away.performanceId).map(shift => `${shift.role}:${shift.slot}`)).toEqual(['DUTY_MANAGER:1'])
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
      durationMinutes: 120,
      intervalCount: 0,
    })
    expect(added.status).toBe(200)
    const { id } = await added.json() as { id: string }

    const stamped = shiftsOn(id)
    expect(stamped).toHaveLength(4)
    expect(stamped.every(shift => shift.status === 'OPEN' && shift.user_id === null)).toBe(true)
  })

  // The house was in the diary before its template, and saving the template stamped it (issue 1319).
  test('saving a template stamped the performance already there, so the backfill finds nothing to add', async () => {
    expect(shiftsOn(house.performanceId)).toHaveLength(4)
    const again = await (await send('POST', `/api/admin/rota/templates/${house.venueId}/stamp`, {}, foh.cookie)).json() as { stamped: number }
    expect(again.stamped).toBe(0)
    expect(shiftsOn(house.performanceId)).toHaveLength(4)
  })

  test('the backfill fills a performance holding some of its slots, and repeats safely', async () => {
    const partial = partlyStaffedAt(house.venueId, 'partial')

    const first = await (await send('POST', `/api/admin/rota/templates/${house.venueId}/stamp`, {}, foh.cookie)).json() as { stamped: number }
    expect(first.stamped).toBe(3)
    expect(shiftsOn(partial)).toHaveLength(4)

    const again = await (await send('POST', `/api/admin/rota/templates/${house.venueId}/stamp`, {}, foh.cookie)).json() as { stamped: number }
    expect(again.stamped).toBe(0)
    expect(shiftsOn(partial)).toHaveLength(4)

    expect(trail('shift.stamped', `venue:${house.venueId}`)?.detail).toMatchObject({ venueId: house.venueId })
  })

  // The imported diary sat unstamped until somebody found "Stamp the diary" (issue 1319).
  test('saving a venue\'s first template stamps its never-stamped performances in the same save', async () => {
    const fresh = programme('first-save')
    expect(shiftsOn(fresh.performanceId)).toHaveLength(0)

    const saved = await send('PUT', `/api/admin/rota/templates/${fresh.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    expect(saved.status).toBe(200)
    expect((await saved.json() as { stamped: number }).stamped).toBe(4)
    expect(shiftsOn(fresh.performanceId).map(shift => `${shift.role}:${shift.slot}:${shift.status}`).sort())
      .toEqual(['BAR:1:OPEN', 'DOOR:1:OPEN', 'DOOR:2:OPEN', 'DUTY_MANAGER:1:OPEN'])
  })

  test('saving a template again stamps nothing onto a rota it already stamped (E-101 criterion 3)', async () => {
    const fresh = programme('second-save')
    await send('PUT', `/api/admin/rota/templates/${fresh.venueId}`, { slots: HOUSE_SLOTS }, foh.cookie)
    const widened = await send('PUT', `/api/admin/rota/templates/${fresh.venueId}`, {
      slots: [{ role: 'DUTY_MANAGER', count: 1 }, { role: 'DOOR', count: 3 }, { role: 'BAR', count: 1 }],
    }, foh.cookie)
    expect((await widened.json() as { stamped: number }).stamped).toBe(0)
    expect(shiftsOn(fresh.performanceId)).toHaveLength(4)
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
      durationMinutes: 120,
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
      durationMinutes: 120,
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
      durationMinutes: 120,
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

// "0/0 confirmed, Fully staffed" was a night nobody was rostered for (issue 1319).
describe.skipIf(skip !== null)('the board says when nobody is rostered (issue 1319)', () => {
  interface Card { kind: string, performanceId?: string, venueId?: string, isExternal?: boolean, hasTemplate?: boolean, shifts: unknown[] }

  test('a card carries its venue, whether we run it and whether a template can fill it', async () => {
    const ours = programme('board-ours')
    const theirs = programme('board-theirs')
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE venues SET is_external = 1 WHERE id = ?').run(theirs.venueId)
    }
    finally {
      database.close()
    }

    const board = await (await send('GET', '/api/admin/rota/shifts/board', undefined, foh.cookie)).json() as { items: Card[] }
    const card = (id: string): Card | undefined => board.items.find(item => item.performanceId === id)
    expect(card(ours.performanceId)).toMatchObject({ venueId: ours.venueId, isExternal: false, hasTemplate: false, shifts: [] })
    expect(card(theirs.performanceId)).toMatchObject({ venueId: theirs.venueId, isExternal: true, hasTemplate: false, shifts: [] })
  })

  test('the card says nobody is rostered at our venue and not rostered at an external one', async () => {
    const ours = programme('words-ours')
    const theirs = programme('words-theirs')
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE venues SET is_external = 1 WHERE id = ?').run(theirs.venueId)
    }
    finally {
      database.close()
    }

    const view = await visitAsFoh('/rota/manage/shifts')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="performance-${ours.performanceId}"]')`)
      expect(await textOf(view, `[data-test="performance-${ours.performanceId}"]`)).toContain('No shifts: nobody is rostered')
      expect(await textOf(view, `[data-test="performance-${theirs.performanceId}"]`)).toContain('Not rostered')
      expect(await textOf(view, `[data-test="performance-${theirs.performanceId}"]`)).not.toContain('Fully staffed')
    }
    finally {
      view.close()
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('the screen the officer works from', () => {
  test('the front of house officer reaches it, and saving a template stamps the diary (issue 1319)', async () => {
    const fresh = programme('screen')
    const view = await visitAsFoh('/rota/manage/templates')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="edit-template-${fresh.venueId}"]')`)
      expect(await textOf(view, '[data-test="templates-table"]')).toContain('unstaffed')

      await click(view, `[data-test="edit-template-${fresh.venueId}"]`)
      await waitFor(view, '!!document.querySelector(\'[data-test="template-submit"]\')')
      await click(view, '[data-test="template-submit"]')
      await waitFor(view, 'document.body.innerText.includes(\'stamped onto the performances that had none\')')
      expect(shiftsOn(fresh.performanceId).length).toBeGreaterThan(0)

      await waitFor(view, `!!document.querySelector('[data-test="stamp-${fresh.venueId}"]')`)
      await click(view, `[data-test="stamp-${fresh.venueId}"]`)
      await waitFor(view, 'document.body.innerText.includes(\'already has its slots\')')
    }
    finally {
      view.close()
    }
  }, 120_000)
})

// DECISION #933, K-129 for the picker: the mapping from shift role to gating module is
// configuration, and this is where a training officer looks for it, labelled per role.
describe.skipIf(skip !== null)('shift eligibility is set from the templates screen', () => {
  afterAll(() => {
    clearConfigOverride(app, 'SHIFT_ELIGIBILITY_BAR_MODULE')
  })

  test('an administrator names the module that unlocks a bar shift, and it holds after a reload', async () => {
    const view = await visitAsAdmin('/rota/manage/templates')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="eligibility-BAR"]')`)
      await pickOption(view, '[data-test="eligibility-BAR"]', gatingModule)
      await waitFor(view, 'document.body.innerText.includes(\'Shift eligibility saved\')')

      await visit(view, `${app.baseURL}/rota/manage/templates`, '[data-test="shift-eligibility"]')
      expect(await textOf(view, '[data-test="shift-eligibility"]')).toContain('Bar service')
    }
    finally {
      view.close()
    }
  }, 120_000)

  // Issue 1318: the rota's owner holds no config permission, and is still the person who has to
  // know what gates each role, so the lines are there to read and there is nothing to change.
  test('a front of house manager reads each role\'s gate on the readiness card, with nothing to change', async () => {
    const view = await visitAsFoh('/rota/manage/templates')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="readiness-eligibility-DOOR"]')`)
      expect(await textOf(view, '[data-test="shift-eligibility"]')).toContain('Door')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="eligibility-DOOR"]\')')).toBe(false)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

// Issue 1318: one card for what a show night needs set up, read by the rota's owner.
describe.skipIf(skip !== null)('the show-night readiness card', () => {
  interface Readiness {
    eligibility: { role: string, moduleId: string | null, standing: string }[]
    venues: { venueId: string, templateSlots: number, systemChecks: string[], emergencyFiled: boolean }[]
    board: { presets: number, milestones: number }
  }

  test('the front of house manager reads it; a member is refused', async () => {
    expect((await send('GET', '/api/admin/rota/readiness', undefined, member.cookie)).status).toBe(403)

    const answered = await send('GET', '/api/admin/rota/readiness', undefined, foh.cookie)
    expect(answered.status).toBe(200)
    const readiness = await answered.json() as Readiness
    expect(readiness.eligibility.map(line => line.role)).toEqual(['DUTY_MANAGER', 'DOOR', 'BAR'])
    expect(readiness.venues.some(venue => venue.venueId === house.venueId)).toBe(true)
    expect(readiness.board).toMatchObject({ presets: expect.any(Number), milestones: expect.any(Number) })
  })

  test('a gating module the catalogue does not hold reads as missing, and a published one as set', async () => {
    await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_BAR_MODULE', { value: gatingModule })
    await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_DOOR_MODULE', { value: 'NOPE-999' })
    try {
      const readiness = await (await send('GET', '/api/admin/rota/readiness', undefined, foh.cookie)).json() as Readiness
      const standing = Object.fromEntries(readiness.eligibility.map(line => [line.role, line.standing]))
      expect(standing.BAR).toBe('SET')
      expect(standing.DOOR).toBe('MISSING')
    }
    finally {
      clearConfigOverride(app, 'SHIFT_ELIGIBILITY_BAR_MODULE')
      clearConfigOverride(app, 'SHIFT_ELIGIBILITY_DOOR_MODULE')
    }
  })
})

// K-123 criterion 12: the rota is one workflow across four sidebar entries, and a screen names
// the step after it rather than sending an officer back to the sidebar.
describe.skipIf(skip !== null)('the rota links itself step to step', () => {
  test('the templates screen carries the way on to the board', async () => {
    const view = await visitAsFoh('/rota/manage/templates')
    try {
      await waitFor(view, `!!document.querySelector('[data-test="rota-next-step"]')`)
      expect(await textOf(view, '[data-test="rota-next-step"]')).toContain('Fill the rota')

      await click(view, '[data-test="rota-next-step"]')
      await waitFor(view, `!!document.querySelector('[data-test="board-from"]')`)
      expect(await view.evaluate<string>('location.pathname')).toBe('/rota/manage/shifts')
    }
    finally {
      view.close()
    }
  }, 120_000)
})

async function visitAsAdmin(path: string): Promise<Bun.WebView> {
  forgetSpentStep(app, adminBrowser.email)
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', adminBrowser.email)
  await fill(view, 'form input[type="password"]', adminBrowserPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
  await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(adminBrowserSecret, stepFor(new Date()) + 1))
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
  await visit(view, `${app.baseURL}${path}`, '[data-test="templates-table"]')
  return view
}

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
