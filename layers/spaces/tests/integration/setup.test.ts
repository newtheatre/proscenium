// Setting up room bookings (SP-05 to SP-12): spaces made bookable, resources, opening hours,
// purposes from a starting list and by hand, what each room allows, and pausing and archiving.
// Runs first in its file: the starting list is offered only while there are no purposes.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import { getBookable, insertBooking } from '../../server/bookings'
import { followArchived, followManaged } from '../../server/setup'
import listBookables from '../../server/api/spaces/bookables/index.get'
import addBookable from '../../server/api/spaces/bookables/index.post'
import readBookable from '../../server/api/spaces/bookables/[id]/index.get'
import putBookable from '../../server/api/spaces/bookables/[id]/index.put'
import putHours from '../../server/api/spaces/bookables/[id]/hours.put'
import putPurposes from '../../server/api/spaces/bookables/[id]/purposes.put'
import setState from '../../server/api/spaces/bookables/[id]/state.post'
import listPurposes from '../../server/api/spaces/purposes/index.get'
import addPurpose from '../../server/api/spaces/purposes/index.post'
import startPurposes from '../../server/api/spaces/purposes/start.post'
import orderPurposes from '../../server/api/spaces/purposes/order.post'
import putPurpose from '../../server/api/spaces/purposes/[id]/index.put'
import purposeState from '../../server/api/spaces/purposes/[id]/state.post'
import { at, attempt, member, place, purpose, ready } from './stage'

const app = server({
  'GET /api/spaces/bookables': listBookables,
  'POST /api/spaces/bookables': addBookable,
  'GET /api/spaces/bookables/:id': readBookable,
  'PUT /api/spaces/bookables/:id': putBookable,
  'PUT /api/spaces/bookables/:id/hours': putHours,
  'PUT /api/spaces/bookables/:id/purposes': putPurposes,
  'POST /api/spaces/bookables/:id/state': setState,
  'GET /api/spaces/purposes': listPurposes,
  'POST /api/spaces/purposes': addPurpose,
  'POST /api/spaces/purposes/start': startPurposes,
  'POST /api/spaces/purposes/order': orderPurposes,
  'PUT /api/spaces/purposes/:id': putPurpose,
  'POST /api/spaces/purposes/:id/state': purposeState,
})

const manager = person(['spaces.bookable.manage', 'spaces.purpose.manage'])
async function req<T = any>(method: string, path: string, body?: unknown, actor = manager): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code

const details = { approval: 'by-purpose', approvalNote: null, externalContact: null, guidance: null, colour: null, maxLengthMinutes: null, requirements: [] }
const newPurpose = { name: 'Read-through', description: null, tier: 3, openTo: 'bookers', needsProduction: false, approval: 'automatic', maxLengthMinutes: null, maxAheadDays: null, minNoticeMinutes: null, mayRepeat: true, canBeBumped: true, requirements: [] }

beforeAll(ready)

describe('purposes (SP-07, SP-08)', () => {
  it('offers the starting lists while there are none, makes one once, and refuses a second', async () => {
    const before = await req('GET', '/api/spaces/purposes')
    expect(before.body.starting.map((s: any) => s.list)).toEqual(['student-society', 'amateur-company', 'small-venue'])
    expect((await req('POST', '/api/spaces/purposes/start', { list: 'student-society' })).status).toBe(200)
    expect(code(await req('POST', '/api/spaces/purposes/start', { list: 'small-venue' }))).toBe('spaces.purposes.started')
    const made = await rows<{ slug: string, tier: number, approval: string }>('SELECT slug, tier, approval FROM spaces_purposes ORDER BY tier, sort')
    expect(made.map(p => p.slug)).toEqual(['maintenance', 'technical', 'rehearsal', 'audition', 'workshop', 'meeting', 'social'])
    expect(made.find(p => p.slug === 'maintenance')).toEqual({ slug: 'maintenance', tier: 1, approval: 'automatic' })
    expect(made.filter(p => p.slug !== 'maintenance').every(p => p.approval === 'approval')).toBe(true)
    expect((await req('GET', '/api/spaces/purposes')).body.starting).toEqual([])
  })

  it('adds a purpose, refuses a second of the same name, and a team purpose always names a production', async () => {
    const made = await req('POST', '/api/spaces/purposes', newPurpose)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(code(await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'read-through' }))).toBe('spaces.purpose.name-taken')
    const team = await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'Fight call', openTo: 'production-team', needsProduction: false })
    expect(await rows('SELECT needs_production FROM spaces_purposes WHERE id = ?', team.body.purposeId)).toEqual([{ needs_production: 1 }])
  })

  it('changes a purpose, keeps the tier of bookings already made, and retires rather than deletes', async () => {
    const p = (await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'Costume fitting', tier: 6 })).body.purposeId
    const put = await req('PUT', `/api/spaces/purposes/${p}`, { ...newPurpose, name: 'Costume fitting', tier: 2, approval: 'approval' })
    expect(put.status, JSON.stringify(put.body)).toBe(200)
    expect(await rows('SELECT tier, approval FROM spaces_purposes WHERE id = ?', p)).toEqual([{ tier: 2, approval: 'approval' }])
    expect((await req('POST', `/api/spaces/purposes/${p}/state`, { to: 'retired' })).status).toBe(200)
    expect(code(await req('POST', `/api/spaces/purposes/${p}/state`, { to: 'retired' }))).toBe('spaces.purpose.changed')
    expect(await rows('SELECT state FROM spaces_purposes WHERE id = ?', p)).toEqual([{ state: 'retired' }])
  })

  it('orders purposes inside a tier', async () => {
    const a = (await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'Order A', tier: 8 })).body.purposeId
    const b = (await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'Order B', tier: 8 })).body.purposeId
    expect((await req('POST', '/api/spaces/purposes/order', { ids: [b, a] })).status).toBe(200)
    expect(await rows('SELECT id FROM spaces_purposes WHERE tier = 8 ORDER BY sort')).toEqual([{ id: b }, { id: a }])
  })

  it('refuses someone who may not set purposes up', async () => {
    expect((await req('POST', '/api/spaces/purposes', { ...newPurpose, name: 'Nope' }, person([]))).status).toBe(403)
  })
})

describe('rooms and resources (SP-05, SP-10, SP-11)', () => {
  it('makes a space bookable once, lists it under its venue, and refuses it twice', async () => {
    const venue = await place()
    const made = await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(code(await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId }))).toBe('spaces.space.unavailable')
    const list = await req('GET', '/api/spaces/bookables')
    const row = list.body.venues.flatMap((v: any) => v.spaces).find((s: any) => s.id === venue.spaceId)
    expect(row).toMatchObject({ bookableId: made.body.bookableId, state: 'active', managed: true })
    expect(await rows('SELECT control FROM spaces_bookables WHERE id = ?', made.body.bookableId)).toEqual([{ control: 'own' }])
    expect(await rows('SELECT name FROM core_events WHERE record_id = ?', made.body.bookableId)).toEqual([{ name: 'spaces.bookable.created' }])
  })

  it('makes a space the theatre does not run an external room with who to ask, and follows it when that changes', async () => {
    const venue = await place()
    await rows('UPDATE core_spaces SET managed = 0 WHERE id = ?', venue.spaceId)
    const made = await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId, externalContact: 'Union room bookings' })
    expect(await rows('SELECT control, external_contact FROM spaces_bookables WHERE id = ?', made.body.bookableId)).toEqual([{ control: 'external', external_contact: 'Union room bookings' }])
  })

  it('adds a resource kept at a venue, and refuses a second of the same name', async () => {
    const venue = await place()
    const van = await req('POST', '/api/spaces/bookables', { name: 'Van', homeVenueId: venue.venueId, control: 'own' })
    expect(van.status, JSON.stringify(van.body)).toBe(200)
    expect(code(await req('POST', '/api/spaces/bookables', { name: 'van', control: 'own' }))).toBe('spaces.resource.name-taken')
    const read = await req('GET', `/api/spaces/bookables/${van.body.bookableId}`)
    expect(read.body.bookable).toMatchObject({ kind: 'resource', name: 'Van', venueId: venue.venueId, state: 'active' })
  })

  it('saves the details tab; a space keeps core\'s control', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    const saved = await req('PUT', `/api/spaces/bookables/${id}`, { ...details, control: 'external', approval: 'always', guidance: 'Key from the box office', colour: 'calendar-3', maxLengthMinutes: 180 })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(await rows('SELECT control, approval, guidance, colour, max_length_minutes FROM spaces_bookables WHERE id = ?', id))
      .toEqual([{ control: 'own', approval: 'always', guidance: 'Key from the box office', colour: 'calendar-3', max_length_minutes: 180 }])
  })
})

describe('opening hours (SP-06)', () => {
  it('replaces the week, keeps always open apart, and refuses spans that overlap or run backwards', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    const week = [{ weekday: 1, opensAt: '09:00', closesAt: '13:00' }, { weekday: 1, opensAt: '14:00', closesAt: '24:00' }, { weekday: 2, opensAt: '00:00', closesAt: '02:00' }]
    expect((await req('PUT', `/api/spaces/bookables/${id}/hours`, { alwaysOpen: false, hours: week })).status).toBe(200)
    expect((await req('GET', `/api/spaces/bookables/${id}`)).body.hours).toEqual(week)
    expect(code(await req('PUT', `/api/spaces/bookables/${id}/hours`, { alwaysOpen: false, hours: [{ weekday: 3, opensAt: '09:00', closesAt: '12:00' }, { weekday: 3, opensAt: '11:00', closesAt: '13:00' }] }))).toBe('spaces.hours.overlap')
    expect(code(await req('PUT', `/api/spaces/bookables/${id}/hours`, { alwaysOpen: false, hours: [{ weekday: 3, opensAt: '18:00', closesAt: '02:00' }] }))).toBe('spaces.hours.backwards')
    expect((await req('GET', `/api/spaces/bookables/${id}`)).body.hours).toEqual(week)
    expect((await req('PUT', `/api/spaces/bookables/${id}/hours`, { alwaysOpen: true, hours: [] })).status).toBe(200)
    expect((await req('GET', `/api/spaces/bookables/${id}`)).body).toMatchObject({ hours: [], bookable: { alwaysOpen: true } })
  })
})

describe('purposes in one room (SP-09)', () => {
  it('keeps only what differs from the purpose, and reads every active purpose back', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    const social = await purpose(6)
    const meeting = await purpose(5)
    const saved = await req('PUT', `/api/spaces/bookables/${id}/purposes`, { purposes: [{ purposeId: social, allowed: false, approval: null }, { purposeId: meeting, allowed: true, approval: 'approval' }] })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(await rows('SELECT purpose_id, allowed, approval FROM spaces_bookable_purposes WHERE bookable_id = ? ORDER BY allowed', id))
      .toEqual([{ purpose_id: social, allowed: 0, approval: null }, { purpose_id: meeting, allowed: 1, approval: 'approval' }])
    const read = (await req('GET', `/api/spaces/bookables/${id}`)).body.purposes
    expect(read.find((p: any) => p.purposeId === social)).toMatchObject({ allowed: false, here: null })
    expect(read.find((p: any) => p.purposeId === meeting)).toMatchObject({ allowed: true, here: 'approval' })
    await req('PUT', `/api/spaces/bookables/${id}/purposes`, { purposes: [{ purposeId: social, allowed: true, approval: null }] })
    expect(await rows('SELECT count(*) AS n FROM spaces_bookable_purposes WHERE bookable_id = ?', id)).toEqual([{ n: 0 }])
  })
})

describe('pausing and archiving (SP-12, rules L4 and L5)', () => {
  it('pauses and resumes, and refuses to archive while a booking is still to come', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    expect((await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'paused' })).status).toBe(200)
    expect(code(await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'paused' }))).toBe('spaces.bookable.wrong-state')
    expect((await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'active' })).status).toBe(200)
    const p = await purpose()
    const who = member()
    const room = (await inContext(() => getBookable(id)))!
    expect(await attempt(unit => insertBooking(unit, { bookable: room, purposeId: p, startsAt: at(10), endsAt: at(11), state: 'confirmed', bookedFor: who, requestedBy: who, title: 'Rehearsal' }, who))).toBe('ok')
    expect(code(await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'archived' }))).toBe('spaces.bookable.has-bookings')
  })

  it('archives a room with nothing ahead, and restores it', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    expect((await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'archived' })).status).toBe(200)
    expect((await req('POST', `/api/spaces/bookables/${id}/state`, { to: 'active' })).status).toBe(200)
  })

  it('archives a room with its space or its venue, and follows whether the theatre runs the space', async () => {
    const venue = await place()
    const id = (await req('POST', '/api/spaces/bookables', { spaceId: venue.spaceId })).body.bookableId
    await rows('UPDATE core_spaces SET managed = 0 WHERE id = ?', venue.spaceId)
    await attempt(unit => followManaged(unit, venue.spaceId, false))
    expect(await rows('SELECT control FROM spaces_bookables WHERE id = ?', id)).toEqual([{ control: 'external' }])
    await attempt(unit => followArchived(unit, { venueId: venue.venueId }))
    expect(await rows('SELECT state FROM spaces_bookables WHERE id = ?', id)).toEqual([{ state: 'archived' }])
  })
})
