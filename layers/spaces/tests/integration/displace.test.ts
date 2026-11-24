// When other things change (SP-33, SP-34; rules L1, L2, L4, B4 and "Many bookings at once"): a
// performance or a blocking closure moves the room bookings in its way aside and declines the
// requests, a removed room cancels what is ahead, each booker is told, and a set too large for one
// unit is finished by spaces.clear-window.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, usePoint, type Actor } from '#kit'
import type { ChangeImpact } from '#modules/core'
import { call, deliver, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import archiveSpace from '../../../core/server/api/core/venues/[id]/spaces/[space]/archive.post'
import book from '../../server/api/spaces/bookings/index.post'
import { HOUR, at, bookable, coreReq, place, purpose, ready } from './stage'

const app = server({ 'POST /api/spaces/bookings': book, 'POST /api/core/venues/:id/spaces/:space/archive': archiveSpace })
const member = () => person(['spaces.booking.request'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number) => ({ bookableId, purposeId, startsAt, endsAt, title: 'Rehearsal', notes: null, attendees: null })
async function room(where?: { venueId: string, spaceId: string }) {
  const venue = where ?? await place()
  const b = await bookable(venue)
  await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', b.id)
  return { ...b, venue }
}
const made = async (who: Actor, bookableId: string, p: string, from: number, to: number) => {
  const r = await req(who, 'POST', '/api/spaces/bookings', ask(bookableId, p, from, to))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.bookingId as string
}
const states = (...ids: string[]) => rows<{ id: string, state: string, closed_reason: string | null }>(`SELECT id, state, closed_reason FROM spaces_bookings WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
  .then(r => Object.fromEntries(r.map(x => [x.id, [x.state, x.closed_reason]])))
const told = (type: string, accountId: string) => rows('SELECT 1 FROM core_notifications WHERE type_key = ? AND account_id = ?', type, accountId).then(r => r.length)

beforeAll(ready)

describe('a performance in the way (L1, SP-34)', () => {
  it('shows the count first, then bumps the bookings, declines the requests and tells each booker', async () => {
    const r = await room()
    const quick = await purpose()
    const slow = await purpose(5, { approval: 'approval' })
    const ann = member()
    const ben = member()
    const bumped = await made(ann, r.id, quick, at(14), at(15))
    const declined = await made(ben, r.id, slow, at(15), at(16))
    const clear = await made(ann, r.id, quick, at(10), at(11))
    const production = await coreReq('POST', '/api/core/productions', { title: 'The Tempest', kind: 'own' })
    const show = await coreReq('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: r.venue.venueId, spaceId: r.venue.spaceId, startsAt: at(14) })
    expect(show.status, JSON.stringify(show.body)).toBe(200)

    const lines = await inContext(async () => {
      const out: string[] = []
      for (const { value } of await usePoint<ChangeImpact>('core.change-impact')) out.push(...await value.impact({ record: { type: 'core.performance', id: show.body.id }, kind: 'reschedule', to: { startsAt: at(14), endsAt: at(16) } }, person([])))
      return out
    })
    expect(lines).toEqual(expect.arrayContaining(['1 room booking will be moved aside, and its booker told.', '1 room request will be declined.']))

    expect((await coreReq('POST', `/api/core/performances/${show.body.id}/schedule`, {})).status).toBe(200)
    await deliver()
    expect(await states(bumped, declined, clear)).toEqual({ [bumped]: ['bumped', 'performance'], [declined]: ['declined', null], [clear]: ['confirmed', null] })
    expect(await told('spaces.booking-bumped', ann.accountId!)).toBe(1)
    expect(await told('spaces.request-declined', ben.accountId!)).toBe(1)
    expect(await rows('SELECT kind FROM spaces_booking_events WHERE booking_id = ? ORDER BY at, id', bumped)).toEqual([{ kind: 'confirmed' }, { kind: 'bumped' }])
  })
})

describe('a closure in the way (L2)', () => {
  it('bumps bookings in the closure\'s spaces and a resource kept at its venue; a non-blocking closure does nothing', async () => {
    const r = await room()
    const other = await room()
    const van = await bookable({ resource: `Van ${r.venue.venueId}`, homeVenueId: r.venue.venueId })
    await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', van.id)
    const p = await purpose()
    const who = member()
    const inside = await made(who, r.id, p, at(24 + 10), at(24 + 11))
    const carried = await made(who, van.id, p, at(24 + 12), at(24 + 13))
    const away = await made(who, other.id, p, at(24 + 10), at(24 + 11))
    const kept = await made(who, r.id, p, at(48 + 10), at(48 + 11))
    expect((await coreReq('POST', '/api/core/closures', { venueId: r.venue.venueId, title: 'Painting', allDay: false, from: '2027-01-14T09:00', to: '2027-01-14T17:00', blocksPerformances: false })).status).toBe(200)
    expect((await coreReq('POST', '/api/core/closures', { venueId: r.venue.venueId, title: 'Rewiring', allDay: false, from: '2027-01-13T09:00', to: '2027-01-13T17:00' })).status).toBe(200)
    await deliver()
    expect(await states(inside, carried, away, kept)).toEqual({
      [inside]: ['bumped', 'closure'], [carried]: ['bumped', 'closure'], [away]: ['confirmed', null], [kept]: ['confirmed', null],
    })
  })
})

describe('a room taken away (L4)', () => {
  it('cancels the bookings ahead when the space is archived', async () => {
    const r = await room()
    const p = await purpose()
    const ahead = await made(member(), r.id, p, at(72 + 10), at(72 + 11))
    const archived = await req(person(['core.venue.manage']), 'POST', `/api/core/venues/${r.venue.venueId}/spaces/${r.venue.spaceId}/archive`, {})
    expect(archived.status, JSON.stringify(archived.body)).toBe(200)
    await deliver()
    expect(await states(ahead)).toEqual({ [ahead]: ['cancelled', 'bookable-removed'] })
    expect(await rows('SELECT state FROM spaces_bookables WHERE id = ?', r.id)).toEqual([{ state: 'archived' }])
  })
})

describe('many bookings at once (I-33)', () => {
  it('moves the soonest in one set and finishes the rest in spaces.clear-window', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.units.set-rows-limit', 10, { reason: 'test', confirm: true })
      await unit.commit()
    })
    const r = await room()
    const p = await purpose()
    const ids: string[] = []
    for (let i = 0; i < 12; i++) ids.push(await made(member(), r.id, p, at(96 + 8) + i * HOUR / 2, at(96 + 8) + (i + 1) * HOUR / 2))
    expect((await coreReq('POST', '/api/core/closures', { venueId: r.venue.venueId, title: 'Flood', allDay: false, from: '2027-01-16T07:00', to: '2027-01-16T20:00' })).status).toBe(200)
    await deliver()
    expect(await rows('SELECT state FROM core_jobs WHERE name = \'spaces.clear-window\'')).toEqual([{ state: 'done' }])
    const after = await states(...ids)
    expect(Object.values(after).every(([s]) => s === 'bumped')).toBe(true)
    expect(await rows('SELECT count(*) AS n FROM spaces_booking_events WHERE kind = \'bumped\' AND booking_id IN (SELECT id FROM spaces_bookings WHERE bookable_id = ?)', r.id)).toEqual([{ n: 12 }])
  })
})
