// Changing a booking (SP-19, rules X2 and X3), the no-show mark (SP-35, X6) and erasure (SP-36):
// a move under every rule that keeps the old time until the new one is certain, a mark only staff
// set and only for a fortnight, and an erased person's future bookings let go.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId, setClock, type Actor } from '#kit'
import { eraseAccount } from '../../../core/server/identity/erasure'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import book from '../../server/api/spaces/bookings/index.post'
import readBooking from '../../server/api/spaces/bookings/[id]/index.get'
import move from '../../server/api/spaces/bookings/[id]/move.post'
import confirm from '../../server/api/spaces/bookings/[id]/confirm.post'
import decline from '../../server/api/spaces/bookings/[id]/decline.post'
import noShow from '../../server/api/spaces/bookings/[id]/no-show.post'
import { HOUR, NOV_24, at, bookable, place, purpose, ready } from './stage'

const app = server({
  'POST /api/spaces/bookings': book,
  'GET /api/spaces/bookings/:id': readBooking,
  'POST /api/spaces/bookings/:id/move': move,
  'POST /api/spaces/bookings/:id/confirm': confirm,
  'POST /api/spaces/bookings/:id/decline': decline,
  'POST /api/spaces/bookings/:id/no-show': noShow,
})

const member = () => person(['spaces.booking.request'])
const decider = () => person(['spaces.booking.decide'])
const staff = person(['spaces.booking.manage'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number, title = 'Rehearsal') =>
  ({ bookableId, purposeId, startsAt, endsAt, title, notes: null, attendees: null })
async function room() {
  const b = await bookable(await place())
  await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', b.id)
  return b
}
const state = (id: string) => rows<{ state: string, starts_at: number, ends_at: number, bookable_id: string }>('SELECT state, starts_at, ends_at, bookable_id FROM spaces_bookings WHERE id = ?', id).then(r => r[0]!)

beforeAll(ready)

describe('moving a booking that needs no decision (X2)', () => {
  it('moves it in one step, over its own old time, and refuses a time someone else holds', async () => {
    const r = await room()
    const other = await room()
    const p = await purpose()
    const who = member()
    const id = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11)))).body.bookingId
    await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(14), at(15)))

    const moved = await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(10, 30), endsAt: at(11, 30) })
    expect(moved.body, JSON.stringify(moved.body)).toEqual({ bookingId: id, state: 'confirmed' })
    expect(await state(id)).toMatchObject({ state: 'confirmed', starts_at: at(10, 30), ends_at: at(11, 30) })

    expect(code(await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(14), endsAt: at(15) }))).toBe('spaces.clash')
    expect(await state(id)).toMatchObject({ starts_at: at(10, 30) })

    expect((await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: other.id, startsAt: at(14), endsAt: at(15) })).status).toBe(200)
    expect(await state(id)).toMatchObject({ bookable_id: other.id, starts_at: at(14) })
    expect(code(await req(member(), 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(16), endsAt: at(17) }))).toBe('core.access.denied')
  })
})

describe('moving a booking that needs a decision (X3)', () => {
  it('keeps the booking until the change is confirmed, loses nothing when it is declined', async () => {
    const r = await room()
    const p = await purpose(5, { approval: 'approval' })
    const who = member()
    const id = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(48 + 10), at(48 + 11)))).body.bookingId
    expect((await req(decider(), 'POST', `/api/spaces/bookings/${id}/confirm`, { note: null, reference: null })).status).toBe(200)

    const first = (await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(48 + 10, 30), endsAt: at(48 + 11, 30) })).body
    expect(first.state).toBe('requested')
    expect(first.bookingId).not.toBe(id)
    expect(await state(id)).toMatchObject({ state: 'confirmed', starts_at: at(48 + 10) })
    expect((await req(who, 'GET', `/api/spaces/bookings/${id}`)).body.booking.change).toMatchObject({ id: first.bookingId, startsAt: at(48 + 10, 30) })
    expect(code(await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(48 + 12), endsAt: at(48 + 13) }))).toBe('spaces.booking.change-waiting')

    expect((await req(decider(), 'POST', `/api/spaces/bookings/${first.bookingId}/decline`, { note: 'Not then.' })).status).toBe(200)
    expect(await state(id)).toMatchObject({ state: 'confirmed', starts_at: at(48 + 10) })

    const second = (await req(who, 'POST', `/api/spaces/bookings/${id}/move`, { bookableId: r.id, startsAt: at(48 + 10, 30), endsAt: at(48 + 11, 30) })).body
    const confirmed = await req(decider(), 'POST', `/api/spaces/bookings/${second.bookingId}/confirm`, { note: null, reference: null })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect(await state(id)).toMatchObject({ state: 'cancelled' })
    expect(await state(second.bookingId)).toMatchObject({ state: 'confirmed', starts_at: at(48 + 10, 30) })
    expect((await req(who, 'GET', `/api/spaces/bookings/${second.bookingId}`)).body.booking.replaces).toMatchObject({ id })
  })
})

describe('the no-show mark (X6)', () => {
  it('is set and cleared by staff on a booking that has happened, for 14 days', async () => {
    const r = await room()
    const p = await purpose()
    const who = member()
    const id = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11)))).body.bookingId
    expect(code(await req(staff, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: true }))).toBe('spaces.booking.wrong-state')
    await rows('UPDATE spaces_bookings SET state = \'completed\' WHERE id = ?', id)
    setClock(at(12))
    expect(code(await req(who, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: true }))).toBe('core.access.denied')
    expect((await req(staff, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: true })).status).toBe(200)
    expect(code(await req(staff, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: true }))).toBe('spaces.booking.no-show-closed')
    expect((await req(staff, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: false })).status).toBe(200)
    setClock(at(11) + 15 * 24 * HOUR)
    expect(code(await req(staff, 'POST', `/api/spaces/bookings/${id}/no-show`, { noShow: true }))).toBe('spaces.booking.no-show-closed')
    setClock(NOV_24)
    expect(await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ? AND kind LIKE \'no-show%\' ORDER BY at', id)).toEqual([{ kind: 'no-show-set' }, { kind: 'no-show-cleared' }])
  })
})

describe('erasure (SP-36)', () => {
  it('cancels future bookings and withdraws open requests, and keeps the past', async () => {
    const r = await room()
    const quick = await purpose()
    const slow = await purpose(5, { approval: 'approval' })
    const who = member()
    await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, \'Rita Room\', \'self\', ?, ?)').bind(who.accountId, NOV_24 - HOUR, NOV_24 - HOUR).run()
    const past = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, quick, at(9), at(10)))).body.bookingId
    const future = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, quick, at(72 + 10), at(72 + 11)))).body.bookingId
    const open = (await req(who, 'POST', '/api/spaces/bookings', ask(r.id, slow, at(72 + 12), at(72 + 13)))).body.bookingId
    await rows('UPDATE spaces_bookings SET state = \'completed\' WHERE id = ?', past)
    setClock(at(11))
    await inContext(() => eraseAccount(who.accountId!))
    setClock(NOV_24)
    const states = await rows<{ id: string, state: string }>('SELECT id, state FROM spaces_bookings WHERE id IN (?, ?, ?)', past, future, open)
    expect(Object.fromEntries(states.map(s => [s.id, s.state]))).toEqual({ [past]: 'completed', [future]: 'cancelled', [open]: 'withdrawn' })
  })
})
