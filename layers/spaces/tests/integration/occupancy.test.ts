// Room bookings and the occupancy seam (R3-03; rule C1a and part 4's core.space-busy): Spaces needs
// occupancy, reports its Confirmed bookings as yielding times labelled as K2 allows, and treats any
// other module's use of a room as a blocker when asking, confirming and drawing the calendar.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isEnabled, newId, type Actor } from '#kit'
import { occupancy } from '../../../occupancy/server/services'
import { calls } from '../../../../tests/fixtures/modules/rehearse/server/contributions/core.space-busy/rehearse'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import book from '../../server/api/spaces/bookings/index.post'
import check from '../../server/api/spaces/bookings/check.post'
import confirm from '../../server/api/spaces/bookings/[id]/confirm.post'
import calendar from '../../server/api/spaces/calendar.get'
import { HOUR, at, bookable, place, purpose, ready } from './stage'

const app = server({
  'POST /api/spaces/bookings': book,
  'POST /api/spaces/bookings/check': check,
  'POST /api/spaces/bookings/:id/confirm': confirm,
  'GET /api/spaces/calendar': calendar,
})

const member = () => person(['spaces.booking.request'])
const decider = () => person(['spaces.booking.decide'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ask = (bookableId: string, purposeId: string, startsAt: number, endsAt: number, title = 'Rehearsal') =>
  ({ bookableId, purposeId, startsAt, endsAt, title, notes: null, attendees: null })

async function room() {
  const where = await place()
  const b = await bookable(where)
  await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', b.id)
  return { ...b, spaceId: where.spaceId }
}
const use = (spaceId: string, from: number, to: number, label: string | null = 'Fight call') =>
  calls.push({ spaceId, kind: 'rehearsal-call', from, to, yields: true, record: { type: 'rehearse.call', id: newId('call') }, label })

beforeAll(async () => {
  await ready()
  await setModule('rehearse', true)
})
beforeEach(() => {
  calls.length = 0
})
afterAll(() => setModule('rehearse', false))

describe('Spaces needs occupancy (R3-03)', () => {
  it('turns occupancy on while room bookings are on', async () => {
    expect(await inContext(() => isEnabled('occupancy'))).toBe(true)
  })
})

describe('room bookings in core.space-busy', () => {
  it('reports Confirmed bookings as yielding, named only where the reader may see them', async () => {
    const r = await room()
    const p = await purpose()
    const who = member()
    await req(who, 'POST', '/api/spaces/bookings', ask(r.id, p, at(10), at(11), 'Hamlet: Act 2'))
    const window = { spaceIds: [r.spaceId], from: at(0), to: at(24) }
    const seen = (reader: Actor | null) => inContext(() => occupancy(window, reader)).then(a => a[0]!.items.filter(i => i.module === 'spaces').map(i => [i.kind, i.yields, i.label]))
    expect(await seen(null)).toEqual([['room-booking', true, null]])
    expect(await seen(who)).toEqual([['room-booking', true, 'Hamlet: Act 2']])
    expect(await seen(person(['spaces.booking.view']))).toEqual([['room-booking', true, 'Hamlet: Act 2']])
    const [{ name }] = await rows<{ name: string }>('SELECT name FROM spaces_purposes WHERE id = ?', p)
    expect(await seen(member())).toEqual([['room-booking', true, name]])
  })
})

describe('another module\'s use of a room (C1a)', () => {
  it('blocks asking for the time, and names it only as in use', async () => {
    const r = await room()
    const p = await purpose()
    use(r.spaceId, at(14), at(16))
    const checked = (await req(member(), 'POST', '/api/spaces/bookings/check', ask(r.id, p, at(15), at(17)))).body
    expect(checked).toMatchObject({ outcome: 'refused', rule: 'C1' })
    expect(checked.blockers.map((b: any) => [b.kind, b.label])).toEqual([['use', undefined]])
    expect(checked.nearest).toMatchObject({ startsAt: at(16), endsAt: at(18) })
    expect(code(await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(15), at(17))))).toBe('spaces.clash')
    expect((await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(16), at(17)))).status).toBe(200)
  })

  it('refuses confirming a request over a use reported since it was made', async () => {
    const r = await room()
    const p = await purpose(5, { approval: 'approval' })
    const asked = (await req(member(), 'POST', '/api/spaces/bookings', ask(r.id, p, at(19), at(20)))).body.bookingId
    use(r.spaceId, at(19) + HOUR / 2, at(21))
    expect(code(await req(decider(), 'POST', `/api/spaces/bookings/${asked}/confirm`, { note: null, reference: null }))).toBe('spaces.clash')
    expect(await rows('SELECT state FROM spaces_bookings WHERE id = ?', asked)).toEqual([{ state: 'requested' }])
  })

  it('draws it on the calendar with the reporting module\'s label', async () => {
    const r = await room()
    use(r.spaceId, at(9), at(10), 'Fight call')
    use(r.spaceId, at(11), at(12), null)
    const items = (await req(person(['spaces.calendar.view']), 'GET', `/api/spaces/calendar?from=2027-01-12&to=2027-01-12&bookables=${r.id}`)).body.items
      .filter((i: any) => i.bookableId === r.id)
    expect(items.map((i: any) => [i.kind, i.title])).toEqual([['use', 'Fight call'], ['use', undefined]])
  })
})
