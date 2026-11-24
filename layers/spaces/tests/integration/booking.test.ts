// Booking without approval (SP-14 to SP-18, SP-22 to SP-24): the rules P1 to P9 in order, the
// clash with its nearest free time (C1, C3), whether a decision is needed (A1), booking for
// someone else and overriding, the booker's own changes, the sweep and the calendar's shaping.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock, type Actor } from '#kit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import calendar from '../../server/api/spaces/calendar.get'
import check from '../../server/api/spaces/bookings/check.post'
import book from '../../server/api/spaces/bookings/index.post'
import mine from '../../server/api/spaces/bookings/index.get'
import options from '../../server/api/spaces/bookings/options.get'
import readBooking from '../../server/api/spaces/bookings/[id]/index.get'
import patchBooking from '../../server/api/spaces/bookings/[id]/index.patch'
import cancel from '../../server/api/spaces/bookings/[id]/cancel.post'
import withdraw from '../../server/api/spaces/bookings/[id]/withdraw.post'
import { sweepBookings } from '../../server/changes'
import { insideHours, nearestFree } from '../../server/rules'
import { HOUR, NOV_24, at, bookable, coreReq, place, purpose, ready } from './stage'

const app = server({
  'GET /api/spaces/calendar': calendar,
  'POST /api/spaces/bookings/check': check,
  'POST /api/spaces/bookings': book,
  'GET /api/spaces/bookings': mine,
  'GET /api/spaces/bookings/options': options,
  'GET /api/spaces/bookings/:id': readBooking,
  'PATCH /api/spaces/bookings/:id': patchBooking,
  'POST /api/spaces/bookings/:id/cancel': cancel,
  'POST /api/spaces/bookings/:id/withdraw': withdraw,
})

const member = () => person(['spaces.booking.request'])
const staff = person(['spaces.booking.manage'])
const admin = person(['spaces.booking.override'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code

async function room(fields: { alwaysOpen?: boolean } = {}) {
  const b = await bookable(await place())
  await rows('UPDATE spaces_bookables SET always_open = ? WHERE id = ?', fields.alwaysOpen === false ? 0 : 1, b.id)
  return b
}
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number, more: Record<string, unknown> = {}) =>
  ({ bookableId, purposeId, startsAt, endsAt, title: 'Rehearsal', notes: null, attendees: null, ...more })

beforeAll(ready)

describe('asking for a room (P1 to P9, A1)', () => {
  it('confirms at once when nothing needs a decision, and sends it for one when the purpose asks', async () => {
    const r = await room()
    const quick = await purpose(5)
    const slow = await purpose(5, { approval: 'approval' })
    const who = member()
    expect((await req(who, 'POST', '/api/spaces/bookings/check', ask(r.id, quick, at(10), at(11)))).body.outcome).toBe('confirm')
    const made = await req(who, 'POST', '/api/spaces/bookings', ask(r.id, quick, at(10), at(11)))
    expect(made.body).toMatchObject({ state: 'confirmed' })
    expect((await req(who, 'POST', '/api/spaces/bookings', ask(r.id, slow, at(12), at(13)))).body).toMatchObject({ state: 'requested' })
    await rows('UPDATE spaces_bookables SET approval = \'always\' WHERE id = ?', r.id)
    expect((await req(who, 'POST', '/api/spaces/bookings/check', ask(r.id, quick, at(14), at(15)))).body.outcome).toBe('request')
  })

  it('P1: refuses someone who may not book, and a paused room', async () => {
    const r = await room()
    const p = await purpose()
    expect(code(await req(person([]), 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11))))).toBe('spaces.request.not-allowed')
    await rows('UPDATE spaces_bookables SET state = \'paused\' WHERE id = ?', r.id)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(10), at(11)))).body).toMatchObject({ outcome: 'refused', rule: 'P1', code: 'spaces.request.not-taking' })
  })

  it('P2: a staff purpose is for staff, a team purpose for the production\'s team', async () => {
    const r = await room()
    const staffOnly = await purpose(1)
    await rows('UPDATE spaces_purposes SET open_to = \'staff\' WHERE id = ?', staffOnly)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, staffOnly, at(10), at(11)))).body.rule).toBe('P2')
    expect((await req(staff, 'POST', '/api/spaces/bookings/check', ask(r.id, staffOnly, at(10), at(11)))).body.outcome).toBe('confirm')
    const team = await purpose(3)
    await rows('UPDATE spaces_purposes SET open_to = \'production-team\', needs_production = 1 WHERE id = ?', team)
    const production = (await coreReq('POST', '/api/core/productions', { title: 'Hamlet', kind: 'own' })).body.id
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, team, at(10), at(11)))).body.code).toBe('spaces.request.production-needed')
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, team, at(10), at(11), { productionId: production }))).body.code).toBe('spaces.request.not-on-team')
    const onTeam = person(['spaces.booking.request'], { facts: ['core.production-team'] })
    expect((await req(onTeam, 'POST', '/api/spaces/bookings/check', ask(r.id, team, at(10), at(11), { productionId: production }))).body.outcome).toBe('confirm')
  })

  it('P3: refuses a purpose this room does not allow, or one retired', async () => {
    const r = await room()
    const p = await purpose()
    await rows('INSERT INTO spaces_bookable_purposes (bookable_id, purpose_id, allowed) VALUES (?, ?, 0)', r.id, p)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(10), at(11)))).body.rule).toBe('P3')
    const q = await purpose()
    await rows('UPDATE spaces_purposes SET state = \'retired\' WHERE id = ?', q)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, q, at(10), at(11)))).body.rule).toBe('P3')
  })

  it('P4: slot marks, an end after the start, and a start still ahead', async () => {
    const r = await room()
    const p = await purpose()
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(10, 5), at(11)))).body.code).toBe('spaces.request.off-slot')
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(11), at(10)))).body.code).toBe('spaces.request.backwards')
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, NOV_24 - HOUR, NOV_24))).body.code).toBe('spaces.request.past')
  })

  it('P5 to P7: length, how far ahead and notice, each passed by an override with a reason (P10)', async () => {
    const r = await room()
    const p = await purpose()
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(9), at(14)))).body).toMatchObject({ rule: 'P5', figure: { minutes: 240 } })
    await rows('UPDATE spaces_purposes SET max_ahead_days = 30 WHERE id = ?', p)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(10), at(11)))).body).toMatchObject({ rule: 'P6', figure: { days: 30 } })
    await rows('UPDATE spaces_purposes SET max_ahead_days = NULL, min_notice_minutes = 1440 WHERE id = ?', p)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, NOV_24 + 2 * HOUR, NOV_24 + 3 * HOUR))).body.rule).toBe('P7')
    expect((await req(admin, 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(9), at(14)))).body.rule).toBe('P5')
    const forced = await req(admin, 'POST', '/api/spaces/bookings', ask(r.id, p, at(9), at(14), { overrideReason: 'Get-in for the panto' }))
    expect(forced.body, JSON.stringify(forced.body)).toMatchObject({ state: 'confirmed' })
    expect(await rows('SELECT override_reason FROM spaces_bookings WHERE id = ?', forced.body.bookingId)).toEqual([{ override_reason: 'Get-in for the panto' }])
  })

  it('P8: inside opening hours, across midnight only where the next day opens at 00:00', async () => {
    const r = await room({ alwaysOpen: false })
    const p = await purpose()
    await rows('INSERT INTO spaces_opening_hours (bookable_id, weekday, opens_at, closes_at) VALUES (?, 2, \'09:00\', \'24:00\'), (?, 3, \'00:00\', \'01:00\')', r.id, r.id)
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(8), at(10)))).body.rule).toBe('P8')
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(22), at(25)))).body.outcome).toBe('confirm')
    expect((await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(23), at(26)))).body.rule).toBe('P8')
  })
})

describe('clashes (C1, C3)', () => {
  it('refuses a taken time, names what is in the way only as K2 allows, and offers the nearest free time', async () => {
    const r = await room()
    const p = await purpose()
    expect((await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(14), at(16)))).body.state).toBe('confirmed')
    const refused = await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(15), at(16)))
    expect(refused.body).toMatchObject({ outcome: 'refused', rule: 'C1', code: 'spaces.clash', nearest: { startsAt: at(16), endsAt: at(17) } })
    expect(refused.body.blockers).toEqual([{ kind: 'booking', startsAt: at(14), endsAt: at(16), label: expect.any(String) }])
    expect((await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(15), at(16)))).status).toBe(409)
  })

  it('works out the nearest free time and whole windows inside hours', () => {
    const blockers = [{ kind: 'booking' as const, id: 'x', startsAt: at(10), endsAt: at(12) }]
    expect(nearestFree({ from: at(11), to: at(12), blockers, slotMinutes: 15, zone: 'Europe/London', open: () => true })).toEqual({ startsAt: at(12), endsAt: at(13) })
    const spans = new Map([[2, [[540, 1020]] as [number, number][]]])
    expect(insideHours(spans, at(9), at(17), 'Europe/London')).toBe(true)
    expect(insideHours(spans, at(9), at(17, 15), 'Europe/London')).toBe(false)
  })
})

describe('for someone else (P11) and the booker\'s own changes (X1, X4)', () => {
  it('staff book on someone\'s behalf; a member cannot', async () => {
    const r = await room()
    const p = await purpose()
    const them = newId('acc')
    expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11), { bookedFor: them })))).toBe('spaces.request.not-for-others')
    const made = await req(staff, 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11), { bookedFor: them }))
    expect(made.body.state).toBe('confirmed')
    expect(await rows('SELECT booked_for, requested_by FROM spaces_bookings WHERE id = ?', made.body.bookingId)).toEqual([{ booked_for: them, requested_by: staff.accountId }])
  })

  it('lists, edits, cancels late and withdraws the booker\'s own; staff cancel with a note', async () => {
    const r = await room()
    const p = await purpose()
    const slow = await purpose(5, { approval: 'approval' })
    const who = member()
    const soon = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, NOV_24 + 3 * HOUR, NOV_24 + 4 * HOUR))).body.bookingId
    const later = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11)))).body.bookingId
    const asked = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, slow, at(12), at(13)))).body.bookingId
    const list = (await req(who, 'GET', '/api/spaces/bookings')).body
    expect(list.upcoming.map((b: any) => b.id)).toEqual([soon, later])
    expect(list.requests.map((b: any) => b.id)).toEqual([asked])
    expect((await req(who, 'PATCH', `/api/spaces/bookings/${later}`, { title: 'Read-through', notes: 'Bring scripts', attendees: 8 })).status).toBe(200)
    expect((await req(who, 'GET', `/api/spaces/bookings/${later}`)).body.booking).toMatchObject({ title: 'Read-through', notes: 'Bring scripts', attendees: 8 })
    expect((await req(member(), 'GET', `/api/spaces/bookings/${later}`)).status).toBe(403)
    expect((await req(who, 'POST', `/api/spaces/bookings/${soon}/cancel`, {})).body).toMatchObject({ late: true })
    expect(code(await req(staff, 'POST', `/api/spaces/bookings/${later}/cancel`, {}))).toBe('spaces.booking.note-needed')
    expect((await req(staff, 'POST', `/api/spaces/bookings/${later}/cancel`, { note: 'The room is needed for a get-in.' })).body).toMatchObject({ late: false })
    expect(await rows('SELECT closed_reason, late_cancel FROM spaces_bookings WHERE id IN (?, ?) ORDER BY starts_at', soon, later)).toEqual([{ closed_reason: 'by-booker', late_cancel: 1 }, { closed_reason: 'by-staff', late_cancel: 0 }])
    expect((await req(who, 'POST', `/api/spaces/bookings/${asked}/withdraw`, {})).status).toBe(200)
    expect(code(await req(who, 'POST', `/api/spaces/bookings/${asked}/withdraw`, {}))).toBe('spaces.booking.wrong-state')
  })
})

describe('the sweep and the calendar', () => {
  it('completes bookings past their end and expires requests past their start, once', async () => {
    const r = await room()
    const p = await purpose()
    const slow = await purpose(5, { approval: 'approval' })
    const who = member()
    const done = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(48 + 9), at(48 + 10)))).body.bookingId
    const lapsed = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, slow, at(48 + 11), at(48 + 12)))).body.bookingId
    setClock(at(48 + 13))
    for (let i = 0; i < 2; i++) {
      await inContext(async () => {
        const unit = createUnit()
        await sweepBookings(unit.view(), 500)
        await unit.commit()
      })
    }
    setClock(NOV_24)
    expect(await rows('SELECT id, state FROM spaces_bookings WHERE id IN (?, ?) ORDER BY starts_at', done, lapsed)).toEqual([{ id: done, state: 'completed' }, { id: lapsed, state: 'expired' }])
    expect(await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ? ORDER BY at, id', done)).toEqual([{ kind: 'confirmed' }, { kind: 'completed' }])
  })

  it('shows others\' bookings by purpose, hides their requests, and shows everything to staff', async () => {
    const r = await room()
    const p = await purpose()
    const slow = await purpose(5, { approval: 'approval' })
    const someone = member()
    await req(someone, 'POST', '/api/spaces/bookings', ask(r.id, p, at(72 + 10), at(72 + 11), { title: 'Secret plans' }))
    await req(someone, 'POST', '/api/spaces/bookings', ask(r.id, slow, at(72 + 12), at(72 + 13)))
    const window = `from=2027-01-15&to=2027-01-15&bookables=${r.id}`
    const seen = (await req(member(), 'GET', `/api/spaces/calendar?${window}`)).body.items.filter((i: any) => i.bookableId === r.id)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'booking', mine: false, purpose: expect.any(String) })
    expect(seen[0].title).toBeUndefined()
    const all = (await req(person(['spaces.booking.view']), 'GET', `/api/spaces/calendar?${window}`)).body.items.filter((i: any) => i.bookableId === r.id)
    expect(all.map((i: any) => i.kind)).toEqual(['booking', 'request'])
    expect(all[0].title).toBe('Secret plans')
  })

  it('offers the form only the rooms and purposes open to the person', async () => {
    const r = await room()
    const staffOnly = await purpose(1)
    await rows('UPDATE spaces_purposes SET open_to = \'staff\' WHERE id = ?', staffOnly)
    const theirs = (await req(member(), 'GET', '/api/spaces/bookings/options')).body
    expect(theirs.bookables.some((b: any) => b.id === r.id)).toBe(true)
    expect(theirs.purposes.some((p: any) => p.id === staffOnly)).toBe(false)
    expect((await req(staff, 'GET', '/api/spaces/bookings/options')).body.purposes.some((p: any) => p.id === staffOnly)).toBe(true)
  })
})
