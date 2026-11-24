// Volunteer sign-up and shift emails: the digest when a rota goes up, per-person cancellation times,
// giving a place up freely after a reschedule, the wording for manager-added and given-up places,
// curtain times and clashes on the open list, and the calendar files.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { newId, setClock } from '#kit'
import { setAccessProvider } from '#kit/access'
import { call, deliver, env, inContext, rows, testAccess } from '../../../../tests/integration/helpers'
import { duty, handle, notes, performance, ready, req, shift, volunteer, MINUTE } from './stage'

const holders = new Set<string>()
beforeAll(async () => {
  await ready()
  setAccessProvider({ ...testAccess, grants: async actor => (actor.accountId && holders.has(actor.accountId) ? [{ ability: 'front-of-house.shift.sign-up', via: 'role' }] : actor.grants ?? []) as never })
})
afterAll(() => setAccessProvider(testAccess))
afterEach(() => setClock(undefined))

const HOUR = 60 * MINUTE
const london = (at: number) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Europe/London' }).format(at)

/** A real account that holds shift.sign-up, so holdersOf finds it. */
async function realVolunteer(): Promise<string> {
  const accountId = newId('acc')
  const roleId = newId('rol')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Vera Volunteer\', \'self\', ?, ?)').bind(accountId, at, at).run()
  await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, \'Volunteer\', 0, 1, 0, \'none\', ?)').bind(roleId, `vol-${roleId.slice(-8)}`, at).run()
  await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, \'front-of-house.shift.sign-up\')').bind(roleId).run()
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, \'acc_testgranter\', ?)').bind(newId('gra'), accountId, roleId, 0, 0).run()
  holders.add(accountId)
  return accountId
}

const payload = async (type: string, accountId: string) => JSON.parse((await rows<{ payload: string }>('SELECT payload FROM core_notifications WHERE type_key = ? AND account_id = ? ORDER BY id DESC', type, accountId))[0]!.payload) as Record<string, string>

describe('FH-7: telling volunteers when a rota goes up', () => {
  it('sends one digest for the whole publish, listing the shifts', async () => {
    const vera = await realVolunteer()
    const p = await performance()
    const usher = await shift(p.id, await duty('Usher'), 3, false)
    const bar = await shift(p.id, await duty('Bar'), 1, false)
    const published = await req('POST', '/api/front-of-house/shifts/publish', { shiftIds: [usher, bar] })
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(await notes('front-of-house.rota-published', vera)).toHaveLength(1)
    const said = await payload('front-of-house.rota-published', vera)
    expect(said.count).toBe('one performance')
    expect(said.shifts).toContain('Usher')
    expect(said.shifts).toContain('3 places')
    // Someone who cannot sign up is not told.
    expect(await notes('front-of-house.rota-published', volunteer().accountId!)).toHaveLength(0)
  })
})

describe('FH-12: cancelling gives each person their own call time', () => {
  it('tells the usher the usher call, not the duty manager call', async () => {
    const p = await performance()
    const early = await shift(p.id, await duty('Duty manager'), 1)
    const late = await shift(p.id, await duty('Usher'), 1)
    const lateCall = p.startsAt - 45 * MINUTE
    expect((await req('PATCH', `/api/front-of-house/shifts/${late}`, { callAt: lateCall })).status).toBe(200)
    const [dm, usher] = [volunteer(), volunteer()]
    await req('POST', `/api/front-of-house/shifts/${early}/sign-up`, {}, dm)
    await req('POST', `/api/front-of-house/shifts/${late}/sign-up`, {}, usher)
    expect((await req('POST', `/api/front-of-house/shifts/${late}/cancel`, { reason: 'Test' })).status).toBe(200)
    const a = await payload('front-of-house.shift-cancelled', usher.accountId!)
    expect(a.when).toContain(london(lateCall))
    expect(a.date).toMatch(/\d/)
    // The whole performance: each their own.
    const q = await performance()
    const one = await shift(q.id, await duty('Duty manager'), 1)
    const two = await shift(q.id, await duty('Usher'), 1)
    await req('PATCH', `/api/front-of-house/shifts/${two}`, { callAt: q.startsAt - 45 * MINUTE })
    const [m, u] = [volunteer(), volunteer()]
    await req('POST', `/api/front-of-house/shifts/${one}/sign-up`, {}, m)
    await req('POST', `/api/front-of-house/shifts/${two}/sign-up`, {}, u)
    await req('POST', `/api/front-of-house/shifts/${one}/cancel`, { reason: 'Test' })
    await req('POST', `/api/front-of-house/shifts/${two}/cancel`, { reason: 'Test' })
    expect((await payload('front-of-house.shift-cancelled', m.accountId!)).when).not.toBe((await payload('front-of-house.shift-cancelled', u.accountId!)).when)
  })
})

describe('FH-11: a shift that moved can be given up freely', () => {
  it('releases at once inside the notice after the performance is rescheduled, and asks for cover otherwise', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 3)
    const [moved, kept] = [volunteer(), volunteer()]
    setClock(p.startsAt - 10 * HOUR)
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, moved)).body.assignmentId
    const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, kept)).body.assignmentId
    // Inside the notice, with nothing changed, giving up asks for cover.
    expect((await req('POST', `/api/front-of-house/assignments/${b}/release`, {}, kept)).body.state).toBe('release_requested')
    expect((await req('PATCH', `/api/front-of-house/shifts/${id}`, { callAt: p.startsAt - 30 * MINUTE })).status).toBe(200)
    const released = await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, moved)
    expect(released.body.state).toBe('released')
    const view = await req('GET', `/api/front-of-house/shifts/${id}`, undefined, kept)
    expect(view.body.mine.freeRelease).toBe(true)
  })
})

describe('EM-3 to EM-6: the shift emails', () => {
  it('dates the subject, gives venue, curtain and briefing, and links a calendar file', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    await req('PATCH', `/api/front-of-house/shifts/${id}`, { briefing: 'Meet at the stage door.' })
    const ann = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ann)
    const said = await payload('front-of-house.shift-confirmed', ann.accountId!)
    expect(said.date).toMatch(/^\w{3} \d/)
    expect(said.details).toContain('Where: Front of house venue')
    expect(said.details).toContain(`Curtain up: ${london(p.startsAt)}`)
    expect(said.details).toContain('Briefing: Meet at the stage door.')
    expect(said.calendar).toMatch(/^https:\/\/theatre\.example\/api\/front-of-house\/assignments\/asg_.+\/calendar\.ics\?k=/)
    // The link downloads that one place, and only with its key.
    const path = new URL(said.calendar).pathname + new URL(said.calendar).search
    const file = await call(handle, 'GET', path)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toContain('text/calendar')
    const text = await file.text()
    expect(text).toContain('BEGIN:VEVENT')
    expect(text).toMatch(/SUMMARY:Steward \d+\\, Front of house show/)
    expect((await call(handle, 'GET', path.replace(/k=.*/, 'k=nope'))).status).toBe(404)
  })

  it('does not thank someone a manager put on the shift', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const eve = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${id}/assign`, { accountId: eve.accountId })).status).toBe(200)
    expect(await notes('front-of-house.shift-confirmed', eve.accountId!)).toHaveLength(0)
    expect(await notes('front-of-house.shift-assigned', eve.accountId!)).toHaveLength(1)
  })

  it('confirms by email when a place is given up, and when cover is asked', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 3)
    const [far, near] = [volunteer(), volunteer()]
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, far)).body.assignmentId
    expect((await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, far)).body.state).toBe('released')
    expect(await notes('front-of-house.shift-released', far.accountId!)).toHaveLength(1)
    const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, near)).body.assignmentId
    setClock(p.startsAt - 10 * HOUR)
    expect((await req('POST', `/api/front-of-house/assignments/${b}/release`, {}, near)).body.state).toBe('release_requested')
    expect(await notes('front-of-house.shift-cover-asked', near.accountId!)).toHaveLength(1)
    await deliver()
  })
})

describe('SU-1, SU-2, SU-6, SU-7: what members see', () => {
  it('shows the curtain, names a clash, and keeps given-up places apart from past ones', async () => {
    const p = await performance()
    const a = await shift(p.id, await duty('Steward'), 2)
    const b = await shift(p.id, await duty('Bar'), 2)
    const eve = volunteer()
    const open = (await req('GET', '/api/front-of-house/open-shifts', undefined, eve)).body.shifts.find((s: any) => s.id === a)
    expect(open.curtainAt).toBe(p.startsAt)
    const signed = (await req('POST', `/api/front-of-house/shifts/${a}/sign-up`, {}, eve)).body.assignmentId
    const clash = (await req('GET', '/api/front-of-house/open-shifts', undefined, eve)).body.shifts.find((s: any) => s.id === b)
    expect(clash.overlaps).toBe(true)
    expect(clash.clash.shiftId).toBe(a)
    const view = await req('GET', `/api/front-of-house/shifts/${b}`, undefined, eve)
    expect(view.body.clash.shiftId).toBe(a)
    expect(view.body.curtainAt).toBe(p.startsAt)
    await req('POST', `/api/front-of-house/assignments/${signed}/release`, {}, eve)
    const mine = (await req('GET', '/api/front-of-house/me/shifts', undefined, eve)).body
    expect(mine.givenUp.map((s: any) => s.shiftId)).toEqual([a])
    expect(mine.past).toEqual([])
  })

  it('lists a shift that needs cover once, in date order', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 1)
    const [holder, other] = [volunteer(), volunteer()]
    const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, holder)).body.assignmentId
    setClock(p.startsAt - 10 * HOUR)
    await req('POST', `/api/front-of-house/assignments/${a}/release`, {}, holder)
    const listed = (await req('GET', '/api/front-of-house/open-shifts', undefined, other)).body.shifts.filter((s: any) => s.id === id)
    expect(listed).toHaveLength(1)
    expect(listed[0].coverFor).toBe(a)
  })
})

describe('SU-8, C-70: calendar feed', () => {
  it('gives each person a private address that lists their shifts, and a new one retires the old', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 2)
    const eve = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, eve)
    const first = (await req('POST', '/api/calendar-feed/me', {}, eve)).body.url as string
    expect(first).toMatch(/^https:\/\/theatre\.example\/calendar\/.+\.ics$/)
    expect((await req('POST', '/api/calendar-feed/me', {}, eve)).body.url).toBe(first)
    const feed = await call(handle, 'GET', new URL(first).pathname)
    expect(feed.status).toBe(200)
    const text = await feed.text()
    expect(text).toContain('SUMMARY:Steward')
    expect(text).toMatch(/UID:front-of-house\.shifts\.asg_\S+@theatre\.example/)
    const second = (await req('POST', '/api/calendar-feed/me/reset', {}, eve)).body.url as string
    expect(second).not.toBe(first)
    expect((await call(handle, 'GET', new URL(first).pathname)).status).toBe(404)
    expect((await call(handle, 'GET', new URL(second).pathname)).status).toBe(200)
    await inContext(async () => undefined)
  })
})
