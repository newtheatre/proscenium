// Deciding requests (SP-25 to SP-28, SP-31, SP-11, SP-30, SP-13): the queue of requests a person
// may decide with what they need to decide them, confirming and declining, nobody deciding their
// own, external rooms asked then answered, the messages, and who can decide each room.
import { env } from 'cloudflare:workers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setAccessProvider, setClock, type Actor } from '#kit'
import { call, deliver, inContext, person, rows, server, testAccess } from '../../../../tests/integration/helpers'
import book from '../../server/api/spaces/bookings/index.post'
import requests from '../../server/api/spaces/requests/index.get'
import confirm from '../../server/api/spaces/bookings/[id]/confirm.post'
import decline from '../../server/api/spaces/bookings/[id]/decline.post'
import placed from '../../server/api/spaces/bookings/[id]/placed.post'
import people from '../../server/api/spaces/bookables/[id]/people.get'
import { sweepBookings } from '../../server/changes'
import remindApprovers from '../../server/tasks/remind-approvers'
import noApprover from '../../server/contributions/core.health-check/no-approver'
import { NOV_24, at, bookable, place, purpose, ready } from './stage'

const app = server({
  'POST /api/spaces/bookings': book,
  'GET /api/spaces/requests': requests,
  'POST /api/spaces/bookings/:id/confirm': confirm,
  'POST /api/spaces/bookings/:id/decline': decline,
  'POST /api/spaces/bookings/:id/placed': placed,
  'GET /api/spaces/bookables/:id/people': people,
})

const member = () => person(['spaces.booking.request'])
const decider = () => person(['spaces.booking.decide', 'spaces.booking.request'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code

async function room(fields: { approval?: 'always' | 'by-purpose', external?: boolean } = {}) {
  const b = await bookable(await place())
  await rows('UPDATE spaces_bookables SET always_open = 1, approval = ?, control = ? WHERE id = ?', fields.approval ?? 'always', fields.external ? 'external' : 'own', b.id)
  return b
}
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number, more: Record<string, unknown> = {}) =>
  ({ bookableId, purposeId, startsAt, endsAt, title: 'Rehearsal', notes: null, attendees: null, ...more })
async function request(who: Actor, bookableId: string, purposeId: string, startsAt: number, endsAt: number) {
  const made = await req(who, 'POST', '/api/spaces/bookings', ask(bookableId, purposeId, startsAt, endsAt))
  expect(made.body, JSON.stringify(made.body)).toMatchObject({ state: 'requested' })
  return made.body.bookingId as string
}

// holdersOf asks the access provider for each candidate's grants: these accounts hold booking.decide.
const deciders = new Set<string>()

/** A real account holding spaces.booking.decide site-wide, so holdersOf finds it. */
async function realDecider(): Promise<string> {
  const accountId = newId('acc')
  const roleId = newId('rol')
  const now = NOV_24 - 60_000
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Dee Decider\', \'self\', ?, ?)').bind(accountId, now, now).run()
  await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, \'Rooms\', 0, 1, 0, \'none\', ?)').bind(roleId, `rooms-${roleId.slice(-8)}`, now).run()
  await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, \'spaces.booking.decide\')').bind(roleId).run()
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, \'acc_testgranter\', ?)').bind(newId('gra'), accountId, roleId, now - 1000, now - 1000).run()
  deciders.add(accountId)
  return accountId
}
const told = (type: string, subjectId: string) => rows<{ account_id: string }>('SELECT account_id FROM core_notifications WHERE type_key = ? AND subject_id = ? ORDER BY account_id', type, subjectId)

beforeAll(async () => {
  await ready()
  setAccessProvider({ ...testAccess, grants: async actor => (actor.accountId && deciders.has(actor.accountId) ? [{ ability: 'spaces.booking.decide', via: 'role' }] : actor.grants ?? []) as never })
})
afterAll(() => setAccessProvider(testAccess))

describe('nobody to decide (SP-13)', () => {
  it('fails the health check while a room that needs decisions has nobody to decide', async () => {
    await room()
    expect((await inContext(() => noApprover.check())).state).toBe('failing')
    await realDecider()
    expect((await inContext(() => noApprover.check())).state).toBe('ok')
  })
})

describe('the requests queue (A2, A3)', () => {
  it('lists the requests a person may decide, with clashes and the booker\'s record, and marks their own', async () => {
    const r = await room()
    const p = await purpose()
    const someone = member()
    const other = member()
    const first = await request(someone, r.id, p, at(10), at(12))
    await request(other, r.id, p, at(11), at(13))
    await rows('UPDATE spaces_bookings SET state = \'cancelled\', late_cancel = 1, starts_at = ?, ends_at = ? WHERE id = ?', NOV_24 - 48 * 3_600_000, NOV_24 - 47 * 3_600_000, await request(someone, r.id, p, at(-48), at(-47)))
    const boss = decider()
    const mine = await request(boss, r.id, p, at(20), at(21))

    const list = (await req(boss, 'GET', '/api/spaces/requests')).body.requests as any[]
    const row = list.find(x => x.id === first)
    expect(row).toMatchObject({ bookableId: r.id, clashes: 1, own: false, external: false })
    expect(row.record).toEqual({ noShows: 0, lateCancels: 1 })
    expect(list.find(x => x.id === mine)).toMatchObject({ own: true })
    expect((await req(member(), 'GET', '/api/spaces/requests')).status).toBe(403)
  })
})

describe('deciding (A4, SP-26, SP-28)', () => {
  it('confirms, and refuses when the time has been taken since', async () => {
    const r = await room({ approval: 'by-purpose' })
    const slow = await purpose(5, { approval: 'approval' })
    const quick = await purpose(5)
    const who = member()
    const a = await request(who, r.id, slow, at(30), at(31))
    const b = await request(who, r.id, slow, at(32), at(33))
    expect((await req(decider(), 'POST', `/api/spaces/bookings/${a}/confirm`, { note: 'Enjoy' })).status).toBe(200)
    expect((await rows('SELECT state, decision_note FROM spaces_bookings WHERE id = ?', a))[0]).toEqual({ state: 'confirmed', decision_note: 'Enjoy' })
    expect((await told('spaces.request-confirmed', a)).map(n => n.account_id)).toEqual([who.accountId])
    expect((await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, quick, at(32), at(33)))).body.state).toBe('confirmed')
    expect(code(await req(decider(), 'POST', `/api/spaces/bookings/${b}/confirm`, {}))).toBe('spaces.clash')
    expect((await rows('SELECT state FROM spaces_bookings WHERE id = ?', b))[0]).toEqual({ state: 'requested' })
  })

  it('declines only with a note, and tells the booker', async () => {
    const r = await room()
    const p = await purpose()
    const who = member()
    const a = await request(who, r.id, p, at(40), at(41))
    expect(code(await req(decider(), 'POST', `/api/spaces/bookings/${a}/decline`, { note: ' ' }))).toBe('spaces.booking.note-needed')
    expect((await req(decider(), 'POST', `/api/spaces/bookings/${a}/decline`, { note: 'The room is being painted.' })).status).toBe(200)
    expect((await rows('SELECT state, decision_note FROM spaces_bookings WHERE id = ?', a))[0]).toEqual({ state: 'declined', decision_note: 'The room is being painted.' })
    expect(await told('spaces.request-declined', a)).toHaveLength(1)
  })

  it('never lets anyone decide their own request', async () => {
    const r = await room()
    const p = await purpose()
    const boss = decider()
    const a = await request(boss, r.id, p, at(50), at(51))
    expect((await req(boss, 'POST', `/api/spaces/bookings/${a}/confirm`, {})).status).toBe(403)
    expect((await req(boss, 'POST', `/api/spaces/bookings/${a}/decline`, { note: 'No' })).status).toBe(403)
  })
})

describe('external rooms (E2, SP-11, SP-30)', () => {
  it('records that the owner was asked, then confirms only with their reference', async () => {
    const r = await room({ external: true, approval: 'by-purpose' })
    const p = await purpose()
    const a = await request(member(), r.id, p, at(60), at(61))
    const boss = decider()
    expect((await req(boss, 'POST', `/api/spaces/bookings/${a}/placed`, {})).status).toBe(200)
    expect(code(await req(boss, 'POST', `/api/spaces/bookings/${a}/placed`, {}))).toBe('spaces.booking.already-asked')
    expect(code(await req(boss, 'POST', `/api/spaces/bookings/${a}/confirm`, {}))).toBe('spaces.booking.reference-needed')
    expect((await req(boss, 'POST', `/api/spaces/bookings/${a}/confirm`, { reference: 'SU-4417' })).status).toBe(200)
    expect((await rows('SELECT state, external_ref FROM spaces_bookings WHERE id = ?', a))[0]).toEqual({ state: 'confirmed', external_ref: 'SU-4417' })
    expect((await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ? ORDER BY at, id', a)).map(e => e.kind)).toEqual(['requested', 'external-placed', 'confirmed'])
  })
})

describe('messages (A5, A6, SP-27, SP-31)', () => {
  it('tells the people who may decide of a new request, and the booker when it expires', async () => {
    const approver = await realDecider()
    const r = await room()
    const p = await purpose()
    const who = member()
    const a = await request(who, r.id, p, at(70), at(71))
    await deliver()
    expect((await told('spaces.request-new', a)).map(n => n.account_id)).toContain(approver)
    setClock(at(70, 30))
    await inContext(async () => {
      const unit = createUnit()
      await sweepBookings(unit.view(), 500)
      await unit.commit()
    })
    setClock(NOV_24)
    expect((await told('spaces.request-expired', a)).map(n => n.account_id)).toEqual([who.accountId])
  })

  it('reminds each approver once a day of requests waiting longer than remind-after', async () => {
    const approver = await realDecider()
    const r = await room()
    const p = await purpose()
    await request(member(), r.id, p, at(80), at(81))
    setClock(NOV_24 + 49 * 3_600_000)
    for (let i = 0; i < 2; i++) {
      await inContext(async () => {
        const unit = createUnit()
        await remindApprovers(unit.view(), { dueAt: Date.now() })
        await unit.commit()
      })
    }
    setClock(NOV_24)
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE type_key = \'spaces.requests-waiting\' AND account_id = ?', approver)).toEqual([{ n: 1 }])
  })
})

describe('who can decide (SP-13)', () => {
  it('names the people who may decide and book in a room', async () => {
    const approver = await realDecider()
    const r = await room()
    const seen = await req(person(['spaces.bookable.manage']), 'GET', `/api/spaces/bookables/${r.id}/people`)
    expect(seen.status).toBe(200)
    expect(seen.body.decide.map((p: any) => p.id)).toContain(approver)
  })
})
