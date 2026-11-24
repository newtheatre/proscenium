// The Availability gate (AV-01 to AV-03, AV-08, rules A1 to A7, R1 to R7): patterns and exceptions
// entered through the routes, levels() read as a planner would, and requests opened and answered.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, isRefusal, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import me from '../../server/api/availability/me.get'
import newPattern from '../../server/api/availability/patterns/index.post'
import putPattern from '../../server/api/availability/patterns/[id].put'
import newException from '../../server/api/availability/exceptions/index.post'
import dropException from '../../server/api/availability/exceptions/[id].delete'
import profile from '../../server/api/availability/profile.put'
import newRequest from '../../server/api/availability/requests/index.post'
import answerRequest from '../../server/api/availability/requests/[id]/answer.post'
import { levels } from '../../server/reading'
import { closeRequest, openRequest, requestStatus, sweepRequests } from '../../server/requests'

const app = server({
  'GET /api/availability/me': me,
  'POST /api/availability/patterns': newPattern,
  'PUT /api/availability/patterns/:id': putPattern,
  'POST /api/availability/exceptions': newException,
  'DELETE /api/availability/exceptions/:id': dropException,
  'PUT /api/availability/profile': profile,
  'POST /api/availability/requests': newRequest,
  'POST /api/availability/requests/:id/answer': answerRequest,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)
const HOUR = 3_600_000
/** Tuesday 12 January 2027, 00:00 in London (GMT). */
const JAN_12 = Date.UTC(2027, 0, 12)
const at = (hour: number) => JAN_12 + hour * HOUR

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

async function attempt(write: (unit: UnitView) => unknown | Promise<unknown>): Promise<string> {
  try {
    await inContext(async () => {
      const unit = createUnit()
      await write(unit.view())
      await unit.commit()
    })
    return 'ok'
  }
  catch (error) {
    if (isRefusal(error)) return (error as any).code
    throw error
  }
}

async function account(name = 'Crew Member'): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, name, NOV_24, NOV_24)
  return who
}

const read = (viewer: Actor, who: Parameters<typeof levels>[0], from = JAN_12, to = at(24)) => inContext(() => levels(who, from, to, viewer), viewer)
const tuesdayEvenings = { label: 'Term', startsOn: '2026-12-01', endsOn: null, lines: [{ weekday: 2, from: '18:00', until: '22:00', level: 'busy' }] }
const exception = (fields: Record<string, unknown> = {}) => ({ firstDate: '2027-01-12', lastDate: '2027-01-12', weekdays: null, from: '19:00', until: '20:00', level: 'free', reason: null, reasonShared: false, ...fields })

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('crews', true)
  await setting('core.locale.time-zone', 'Europe/London')
})

beforeEach(() => {
  setClock(NOV_24)
  crews.clear()
})

describe('patterns (A2)', () => {
  it('saves a pattern with its lines and shows it on my page', async () => {
    const sam = person([])
    const made = await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const page = await req(sam, 'GET', '/api/availability/me?from=2027-01-12&to=2027-01-12')
    expect(page.body.patterns).toEqual([{ id: made.body.patternId, label: 'Term', startsOn: '2026-12-01', endsOn: null, lines: [{ weekday: 2, from: '18:00', until: '22:00', level: 'busy' }] }])
    expect(page.body.days).toEqual([{ date: '2027-01-12', pieces: [{ start: 0, end: 1080, level: 'unknown' }, { start: 1080, end: 1320, level: 'busy' }, { start: 1320, end: 1440, level: 'unknown' }] }])
    expect((await rows('SELECT name, payload FROM core_events WHERE record_id = ?', sam.accountId))[0]).toMatchObject({ name: 'availability.entry.updated' })
  })

  it('refuses a second pattern over the same dates, naming the first', async () => {
    const sam = person([])
    await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    const clash = await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, label: 'Spring', startsOn: '2027-01-01' })
    expect(clash.status).toBe(409)
    expect(clash.body.code).toBe('availability.patterns-overlap')
    expect(JSON.stringify(clash.body)).toContain('Term')
    const before = await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, label: 'Autumn', startsOn: '2026-10-01', endsOn: '2026-11-30' })
    expect(before.status).toBe(200)
  })

  it('refuses times off the grid step, backwards or overlapping on one day', async () => {
    const sam = person([])
    const line = (from: string, until: string) => ({ weekday: 3, from, until, level: 'busy' })
    expect((await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, lines: [line('18:15', '19:00')] })).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, lines: [line('19:00', '18:00')] })).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, lines: [line('18:00', '20:00'), line('19:00', '21:00')] })).status).toBe(422)
    await setting('availability.grid.step', '15')
    expect((await req(sam, 'POST', '/api/availability/patterns', { ...tuesdayEvenings, lines: [line('18:15', '19:00')] })).status).toBe(200)
    await setting('availability.grid.step', '30')
  })

  it('lets a person change only their own pattern', async () => {
    const sam = person([])
    const made = await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    const other = await req(person([]), 'PUT', `/api/availability/patterns/${made.body.patternId}`, { ...tuesdayEvenings, label: 'Mine now' })
    expect(other.status).toBe(404)
  })
})

describe('exceptions (A3)', () => {
  it('refuses days before today, beyond the horizon and half a time', async () => {
    const sam = person([])
    expect((await req(sam, 'POST', '/api/availability/exceptions', exception({ firstDate: '2026-11-23' }))).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/exceptions', exception({ firstDate: '2028-01-01', lastDate: '2028-01-01' }))).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/exceptions', exception({ until: null }))).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/exceptions', exception())).status).toBe(200)
  })

  it('keeps the past days of an entry when it is removed part-way through', async () => {
    const sam = person([])
    const made = await req(sam, 'POST', '/api/availability/exceptions', exception({ firstDate: '2026-11-24', lastDate: '2026-11-30', from: null, until: null, level: 'busy' }))
    setClock(Date.UTC(2026, 10, 27, 9))
    expect((await req(sam, 'DELETE', `/api/availability/exceptions/${made.body.exceptionId}`)).status).toBe(200)
    expect(await rows('SELECT first_date, last_date FROM availability_exceptions WHERE id = ?', made.body.exceptionId)).toEqual([{ first_date: '2026-11-24', last_date: '2026-11-26' }])
  })
})

describe('levels (A4, A7)', () => {
  it('lets the latest exception win over the pattern, and unmarked time follow the person or the theatre', async () => {
    const sam = person([])
    await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    await req(sam, 'POST', '/api/availability/exceptions', exception({ level: 'maybe', from: '18:00', until: '21:00' }))
    await req(sam, 'POST', '/api/availability/exceptions', exception())
    const day = (await read(sam, { accountIds: [sam.accountId!] })).blocks.map(b => [(b.from - JAN_12) / HOUR, (b.to - JAN_12) / HOUR, b.level])
    expect(day).toEqual([[0, 18, 'unknown'], [18, 19, 'maybe'], [19, 20, 'free'], [20, 21, 'maybe'], [21, 22, 'busy'], [22, 24, 'unknown']])

    await setting('availability.entry.unmarked-default', 'free')
    expect((await read(sam, { accountIds: [sam.accountId!] })).blocks[0]!.level).toBe('free')
    await req(sam, 'PUT', '/api/availability/profile', { unmarkedMeans: 'unknown' })
    expect((await read(sam, { accountIds: [sam.accountId!] })).blocks[0]!.level).toBe('unknown')
    await setting('availability.entry.unmarked-default', 'unknown')
  })

  it('shows a shared reason only through a group, hides people nobody plans for, and counts them', async () => {
    const sam = person([])
    const planner = person([])
    const finder = person(['availability.find.anyone'])
    const stranger = person([])
    await req(sam, 'POST', '/api/availability/exceptions', exception({ level: 'busy', reason: 'Exam', reasonShared: true }))
    crews.set('crews:lx', { label: 'Lighting', members: [sam.accountId!], planners: [planner.accountId!] })

    const viaGroup = await read(planner, { groupId: 'crews:lx' })
    expect(viaGroup.blocks.find(b => b.level === 'busy')).toMatchObject({ accountId: sam.accountId, reason: 'Exam' })
    const asNamed = await read(planner, { accountIds: [sam.accountId!] })
    expect(asNamed.blocks.find(b => b.level === 'busy')!.reason).toBe('Exam')
    const anyone = await read(finder, { accountIds: [sam.accountId!] })
    expect(anyone.blocks.find(b => b.level === 'busy')).not.toHaveProperty('reason')
    expect(await read(stranger, { accountIds: [sam.accountId!] })).toEqual({ blocks: [], hidden: 1 })
    expect(await attempt(() => inContext(() => levels({ groupId: 'crews:lx' }, JAN_12, at(24), stranger), stranger))).toBe('availability.group.not-yours')
  })

  it('keeps a reason the person did not share to themselves', async () => {
    const sam = person([])
    const planner = person([])
    await req(sam, 'POST', '/api/availability/exceptions', exception({ level: 'busy', reason: 'Hospital', reasonShared: false }))
    crews.set('crews:sm', { label: 'Stage management', members: [sam.accountId!], planners: [planner.accountId!] })
    expect((await read(planner, { groupId: 'crews:sm' })).blocks.find(b => b.level === 'busy')).not.toHaveProperty('reason')
    expect((await read(sam, { accountIds: [sam.accountId!] })).blocks.find(b => b.level === 'busy')!.reason).toBe('Hospital')
  })

  it('refuses a window wider than 62 days', async () => {
    const sam = person([])
    expect(await attempt(() => inContext(() => levels({ accountIds: [sam.accountId!] }, JAN_12, JAN_12 + 63 * 24 * HOUR, sam), sam))).toBe('availability.window')
  })
})

describe('requests (R1 to R7)', () => {
  it('asks every member of a group once, tells them, and records an answer', async () => {
    const [ana, ben] = [await account('Ana'), await account('Ben')]
    const planner = person(['availability.request.send'])
    crews.set('crews:cast', { label: 'Cast', members: [ana.accountId!, ben.accountId!], planners: [planner.accountId!] })
    const made = await req(planner, 'POST', '/api/availability/requests', { title: 'Spring term', message: null, groupIds: ['crews:cast'], accountIds: [ana.accountId], from: '2027-01-11', to: '2027-03-19', dueOn: '2026-12-01' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body).toMatchObject({ asked: 2, existing: false })
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE type_key = \'availability.request-opened\' AND account_id IN (?, ?)', ana.accountId, ben.accountId)).toEqual([{ n: 2 }])

    expect((await req(ana, 'POST', `/api/availability/requests/${made.body.requestId}/answer`, {})).status).toBe(200)
    expect(await rows('SELECT checked_to FROM availability_profiles WHERE account_id = ?', ana.accountId)).toEqual([{ checked_to: '2027-03-19' }])
    expect((await req(person([]), 'POST', `/api/availability/requests/${made.body.requestId}/answer`, {})).status).toBe(409)
    const status = await inContext(() => requestStatus(made.body.requestId, planner), planner)
    expect(status!.counts).toEqual({ asked: 1, answered: 1, lapsed: 0, withdrawn: 0 })
    expect(status!.people).toHaveLength(2)
    expect((await inContext(() => requestStatus(made.body.requestId, ana), ana))!.people).toBeUndefined()
  })

  it('refuses asking people the planner does not plan for', async () => {
    const outsider = await account()
    const planner = person(['availability.request.send'])
    const made = await req(planner, 'POST', '/api/availability/requests', { title: 'Get-in', message: null, groupIds: [], accountIds: [outsider.accountId], from: '2027-01-11', to: '2027-01-12', dueOn: '2026-12-01' })
    expect(made.status).toBe(403)
  })

  it('answers the open request for a source rather than opening another, and closes it', async () => {
    const ana = await account()
    const input = { sourceRef: `rehearsals.schedule:${newId('rhs')}`, groupIds: [], accountIds: [ana.accountId!], from: '2027-01-11', to: '2027-01-31', dueOn: '2026-12-10', title: 'Hamlet', message: null, openedBy: ana.accountId! }
    const open = async () => {
      let out: Awaited<ReturnType<typeof openRequest>> | undefined
      await attempt(async (unit) => { out = await openRequest(unit, input) })
      return out!
    }
    const first = await open()
    expect(await open()).toEqual({ requestId: first.requestId, asked: 0, existing: true })
    await attempt(unit => closeRequest(unit, input.sourceRef))
    expect(await rows('SELECT state FROM availability_requests WHERE id = ?', first.requestId)).toEqual([{ state: 'closed' }])
    expect((await open()).existing).toBe(false)
  })

  it('lapses the unanswered after the due date and closes after the last date', async () => {
    const ana = await account()
    const input = { sourceRef: null, groupIds: [], accountIds: [ana.accountId!], from: '2026-11-30', to: '2026-12-05', dueOn: '2026-11-28', title: 'Get-in week', message: null, openedBy: ana.accountId! }
    let id = ''
    await attempt(async (unit) => { id = (await openRequest(unit, input)).requestId })
    setClock(Date.UTC(2026, 10, 29, 9))
    await attempt(unit => sweepRequests(unit))
    expect(await rows('SELECT p.state AS asked, r.state FROM availability_request_people p JOIN availability_requests r ON r.id = p.request_id WHERE r.id = ?', id)).toEqual([{ asked: 'lapsed', state: 'open' }])
    setClock(Date.UTC(2026, 11, 6, 9))
    await attempt(unit => sweepRequests(unit))
    expect(await rows('SELECT state FROM availability_requests WHERE id = ?', id)).toEqual([{ state: 'closed' }])
  })
})
