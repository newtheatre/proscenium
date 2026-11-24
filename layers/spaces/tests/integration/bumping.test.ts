// Priority bumping by request (SP-32; rules C5, B1 to B3, B5): a request may ask for a time held only
// by lower-tier bookings that may be bumped; confirming it moves them aside and tells their bookers.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, type Actor } from '#kit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import book from '../../server/api/spaces/bookings/index.post'
import check from '../../server/api/spaces/bookings/check.post'
import requests from '../../server/api/spaces/requests/index.get'
import confirm from '../../server/api/spaces/bookings/[id]/confirm.post'
import checkSeries from '../../server/api/spaces/series/check.post'
import { HOUR, NOV_24, at, bookable, coreReq, place, purpose, ready } from './stage'

const app = server({
  'POST /api/spaces/bookings': book,
  'POST /api/spaces/bookings/check': check,
  'GET /api/spaces/requests': requests,
  'POST /api/spaces/bookings/:id/confirm': confirm,
  'POST /api/spaces/series/check': checkSeries,
})
const member = () => person(['spaces.booking.request'])
const decider = () => person(['spaces.booking.decide', 'spaces.booking.request'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number, more: Record<string, unknown> = {}) =>
  ({ bookableId, purposeId, startsAt, endsAt, title: 'Dress rehearsal', notes: null, attendees: null, ...more })
async function room() {
  const venue = await place()
  const b = await bookable(venue)
  await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', b.id)
  return { ...b, venue }
}
async function made(who: Actor, bookableId: string, p: string, from: number, to: number) {
  const r = await req(who, 'POST', '/api/spaces/bookings', ask(bookableId, p, from, to))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as { bookingId: string, state: string }
}
const state = (id: string) => rows<{ state: string, closed_reason: string | null, bumped_by_id: string | null }>('SELECT state, closed_reason, bumped_by_id FROM spaces_bookings WHERE id = ?', id).then(r => r[0])
async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

beforeAll(ready)

describe('asking for a time a lower tier holds (C5, B1, B5)', () => {
  it('sends it for a decision naming what it would bump; confirming bumps them and tells the booker (B2, B4)', async () => {
    const r = await room()
    const meeting = await purpose(5)
    const dress = await purpose(2)
    const ann = member()
    const ben = member()
    const held = await made(ann, r.id, meeting, at(10), at(12))
    expect(held.state).toBe('confirmed')

    const checked = await req(ben, 'POST', '/api/spaces/bookings/check', ask(r.id, dress, at(11), at(13)))
    expect(checked.body).toMatchObject({ outcome: 'request', bumps: true })
    expect(checked.body.blockers).toHaveLength(1)
    const asked = await made(ben, r.id, dress, at(11), at(13))
    expect(asked.state).toBe('requested')

    const boss = decider()
    const queue = (await req(boss, 'GET', '/api/spaces/requests')).body.requests.find((q: any) => q.id === asked.bookingId)
    expect(queue.bumps).toEqual([expect.objectContaining({ title: 'Dress rehearsal', startsAt: at(10), endsAt: at(12) })])

    const done = await req(boss, 'POST', `/api/spaces/bookings/${asked.bookingId}/confirm`, {})
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(await state(held.bookingId)).toEqual({ state: 'bumped', closed_reason: 'higher-tier', bumped_by_id: asked.bookingId })
    expect((await state(asked.bookingId))!.state).toBe('confirmed')
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'spaces.booking-bumped\' AND account_id = ?', ann.accountId)).toHaveLength(1)
  })

  it('refuses at once when the tier is equal, the purpose may not be bumped, or bumping is off', async () => {
    const r = await room()
    const meeting = await purpose(5)
    const fixed = await purpose(5, { canBeBumped: false })
    const peer = await purpose(5)
    const dress = await purpose(2)
    await made(member(), r.id, meeting, at(24 + 10), at(24 + 11))
    await made(member(), r.id, fixed, at(48 + 10), at(48 + 11))
    expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, peer, at(24 + 10), at(24 + 11))))).toBe('spaces.clash')
    expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, dress, at(48 + 10), at(48 + 11))))).toBe('spaces.clash')
    await setting('spaces.bumping.enabled', false)
    try {
      expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, dress, at(24 + 10), at(24 + 11))))).toBe('spaces.clash')
    }
    finally {
      await setting('spaces.bumping.enabled', true)
    }
    expect((await made(member(), r.id, dress, at(24 + 10), at(24 + 11))).state).toBe('requested')
  })

  it('never lets a series move anything aside', async () => {
    const r = await room()
    const meeting = await purpose(5)
    const dress = await purpose(2)
    await rows('UPDATE spaces_purposes SET may_repeat = 1 WHERE id = ?', dress)
    await made(member(), r.id, meeting, at(19), at(21))
    const series = await req(member(), 'POST', '/api/spaces/series/check', {
      bookableId: r.id, purposeId: dress, frequency: 'weekly', weekdays: null, startsLocal: '19:00', lengthMinutes: 120, firstDate: '2027-01-12', lastDate: '2027-01-19',
      title: 'Dress rehearsals', notes: null, attendees: null, leaveOut: [],
    })
    expect(series.status, JSON.stringify(series.body)).toBe(200)
    expect(series.body.occurrences.map((o: any) => o.code ?? o.outcome)).toEqual(['spaces.series.would-bump', 'confirm'])
  })
})

describe('inside the notice (B3) and at the decision (B2)', () => {
  it('refuses inside the notice unless an override holder gives a reason, at the ask and at the decision', async () => {
    const r = await room()
    const meeting = await purpose(5)
    const dress = await purpose(2)
    const soon = (h: number) => NOV_24 + h * HOUR
    const held = await made(member(), r.id, meeting, soon(30), soon(32))
    await setting('spaces.bumping.notice', 0)
    const early = await made(member(), r.id, dress, soon(30), soon(31))
    await setting('spaces.bumping.notice', 48 * 3600)
    expect(early.state).toBe('requested')

    expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, dress, soon(31), soon(32))))).toBe('spaces.bump.notice')
    const boss = person(['spaces.booking.request', 'spaces.booking.override'])
    const overriding = await req(boss, 'POST', '/api/spaces/bookings', ask(r.id, dress, soon(31), soon(32), { overrideReason: 'The get-in moved.' }))
    expect(overriding.body).toMatchObject({ state: 'requested' })

    expect(code(await req(decider(), 'POST', `/api/spaces/bookings/${early.bookingId}/confirm`, {}))).toBe('spaces.bump.notice')
    expect((await state(held.bookingId))!.state).toBe('confirmed')
    const allowed = person(['spaces.booking.decide', 'spaces.booking.override'])
    expect((await req(allowed, 'POST', `/api/spaces/bookings/${early.bookingId}/confirm`, { overrideReason: 'The get-in moved.' })).status).toBe(200)
    expect((await state(held.bookingId))!.state).toBe('bumped')
    expect(await rows('SELECT 1 FROM core_audit WHERE record_id = ? AND ability = \'spaces.booking.override\'', early.bookingId)).toHaveLength(1)
  })

  it('writes nothing when something in the way can no longer be bumped', async () => {
    const r = await room()
    const meeting = await purpose(5)
    const dress = await purpose(2)
    const held = await made(member(), r.id, meeting, at(72 + 10), at(72 + 12))
    const asked = await made(member(), r.id, dress, at(72 + 10), at(72 + 12))
    const production = await coreReq('POST', '/api/core/productions', { title: 'Macbeth', kind: 'own' })
    const show = await coreReq('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: r.venue.venueId, spaceId: r.venue.spaceId, startsAt: at(72 + 10) })
    expect((await coreReq('POST', `/api/core/performances/${show.body.id}/schedule`, {})).status).toBe(200)

    expect(code(await req(decider(), 'POST', `/api/spaces/bookings/${asked.bookingId}/confirm`, {}))).toBe('spaces.bump.not-now')
    expect((await state(held.bookingId))!.state).toBe('confirmed')
    expect((await state(asked.bookingId))!.state).toBe('requested')
  })
})
