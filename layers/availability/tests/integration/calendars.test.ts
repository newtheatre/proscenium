// Calendar imports by secret address (AV-26, I1 to I6): connecting, busy only, exceptions over
// imports, a planner never seeing the source, the site's own commitments dropped, failing and
// broken connections, and disconnecting (T-AV-32, T-AV-33, T-AV-35, T-AV-36).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import { crew } from '../../../../tests/fixtures/modules/crewcall/server/contributions/core.person-busy/crewcall'
import { personsBusy } from '../../../person-busy/server/services'
import list from '../../server/api/availability/calendars/index.get'
import connect from '../../server/api/availability/calendars/index.post'
import change from '../../server/api/availability/calendars/[id]/index.put'
import refreshPost from '../../server/api/availability/calendars/[id]/refresh.post'
import disconnectPost from '../../server/api/availability/calendars/[id]/disconnect.post'
import mine from '../../server/api/availability/me.get'
import newException from '../../server/api/availability/exceptions/index.post'
import findPost from '../../server/api/availability/find/index.post'
import { refreshJob, syncCalendars } from '../../server/calendars'
import { eraseAccount } from '../../../core/server/identity/erasure'

const app = server({
  'GET /api/availability/calendars': list,
  'POST /api/availability/calendars': connect,
  'PUT /api/availability/calendars/:id': change,
  'POST /api/availability/calendars/:id/refresh': refreshPost,
  'POST /api/availability/calendars/:id/disconnect': disconnectPost,
  'GET /api/availability/me': mine,
  'POST /api/availability/exceptions': newException,
  'POST /api/availability/find': findPost,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)
const TUESDAY = '2026-12-01'
const URL = 'https://calendar.example.org/secret/basic.ics'

const event = (uid: string, start: string, end: string, extra = '') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${end}\r\n${extra}END:VEVENT\r\n`
const calendar = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n${events.join('')}END:VCALENDAR\r\n`
const UNI = calendar(
  event('lecture@uni', '20261201T180000Z', '20261201T200000Z', 'SUMMARY:Secret seminar\r\nLOCATION:Room 101\r\n'),
  event('call@uni', '20261202T180000Z', '20261202T190000Z', 'SUMMARY:Same as the crew call\r\n'),
)

let answer: (url: string) => Response
const fetched: string[] = []

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function run(write: (unit: UnitView) => unknown | Promise<unknown>) {
  await inContext(async () => {
    const unit = createUnit()
    await write(unit.view())
    await unit.commit()
  })
}

async function account(name: string): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, name, NOV_24, NOV_24)
  return who
}

const blocksOf = (connectionId: string) => rows<{ starts_at: number, ends_at: number, level: string }>('SELECT starts_at, ends_at, level FROM availability_imported_blocks WHERE connection_id = ? ORDER BY starts_at', connectionId)
const stateOf = async (id: string) => (await rows<{ state: string, failures: number }>('SELECT state, failures FROM availability_calendar_connections WHERE id = ?', id))[0]
const told = async (who: Actor) => ((await rows<{ n: number }>('SELECT count(*) AS n FROM core_notifications WHERE type_key = \'availability.calendar-broken\' AND account_id = ?', who.accountId))[0]!.n)
const plug = (who: Actor, fields: Record<string, unknown> = {}) => req(who, 'POST', '/api/availability/calendars', { label: 'Uni timetable', url: URL, tentativeAs: 'maybe', ...fields })

let ana: Actor, ben: Actor, planner: Actor

beforeAll(async () => {
  setClock(NOV_24)
  await setModule('availability', true)
  await setModule('occupancy', true)
  await setModule('crews', true)
  await setModule('crewcall', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  ;[ana, ben] = [await account('Ana'), await account('Ben')]
  planner = await account('Pat')
  planner.grants = [{ ability: 'availability.find.use', via: 'role' }] as Actor['grants']
  crews.set('crews:cal', { label: 'Calendar crew', members: [ana.accountId!, ben.accountId!], planners: [planner.accountId!] })
})

beforeEach(() => {
  resetRateLimits()
  answer = () => new Response(UNI, { headers: { 'content-type': 'text/calendar' } })
  fetched.length = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    fetched.push(url)
    return answer(url)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  crew.calls = []
})

describe('connecting a calendar address (I1, I3, I4, T-AV-32, T-AV-33)', () => {
  it('refuses what is not a public https calendar, keeps only busy times, and drops the person\'s own firm commitments', async () => {
    expect((await plug(ana, { url: 'http://calendar.example.org/x.ics' })).body.code).toBe('availability.calendar.address')
    expect((await plug(ana, { url: 'https://localhost/x.ics' })).body.code).toBe('availability.calendar.address')
    answer = () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })
    expect((await plug(ana)).body.code).toBe('availability.calendar.unreadable')
    answer = () => new Response(UNI)

    crew.calls = [{ accountId: ana.accountId!, kind: 'call', from: Date.UTC(2026, 11, 2, 18), to: Date.UTC(2026, 11, 2, 19), firm: true, labelKey: 'crewcall.call', record: null }]
    const made = await plug(ana, { url: 'webcal://calendar.example.org/secret/basic.ics' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(fetched.at(-1)).toBe(URL)
    const id = made.body.connectionId
    expect(await blocksOf(id)).toEqual([{ starts_at: Date.UTC(2026, 11, 1, 18), ends_at: Date.UTC(2026, 11, 1, 20), level: 'busy' }])

    const stored = JSON.stringify(await rows('SELECT * FROM availability_calendar_connections WHERE id = ?', id)) + JSON.stringify(await rows('SELECT * FROM availability_imported_blocks'))
    expect(stored).not.toMatch(/Secret|Room 101|calendar\.example\.org/)
    const listed = await req(ana, 'GET', '/api/availability/calendars')
    expect(listed.body).toMatchObject({ offers: { ics: true }, max: 3, connections: [{ id, kind: 'ics', label: 'Uni timetable', tentativeAs: 'maybe', state: 'active' }] })
    expect(JSON.stringify(listed.body)).not.toContain('example.org')
    expect((await req(ben, 'GET', '/api/availability/calendars')).body.connections).toEqual([])
    expect((await req(ben, 'POST', `/api/availability/calendars/${id}/disconnect`, {})).status).toBe(404)
  })

  it('allows at most import.max-connections', async () => {
    await run(unit => changeSetting(unit, 'availability.import.max-connections', 1, { reason: 'test', confirm: true }))
    expect((await plug(ana, { label: 'Second' })).body.code).toBe('availability.calendar.too-many')
    await run(unit => changeSetting(unit, 'availability.import.max-connections', 3, { reason: 'test', confirm: true }))
  })
})

describe('imported time in levels (A4, I6, T-AV-36)', () => {
  it('gives way to an exception, shows its label only to the person, and reaches planners as plain busy', async () => {
    expect((await req(ana, 'POST', '/api/availability/exceptions', { firstDate: TUESDAY, lastDate: TUESDAY, weekdays: null, from: '19:00', until: '20:00', level: 'free', reason: null, reasonShared: false })).status).toBe(200)
    const own = await req(ana, 'GET', `/api/availability/me?from=${TUESDAY}&to=${TUESDAY}`)
    expect(own.body.days[0].pieces).toEqual(expect.arrayContaining([{ start: 1080, end: 1140, level: 'busy', imported: 'Uni timetable' }, { start: 1140, end: 1200, level: 'free' }]))
    const found = await req(planner, 'POST', '/api/availability/find', { groupIds: ['crews:cal'], accountIds: [], must: [], from: TUESDAY, to: TUESDAY, hoursFrom: '17:00', hoursTo: '22:00', length: 60, spaceIds: [], roomOptional: false })
    expect(found.body.weeks[ana.accountId!][TUESDAY]).toContainEqual({ start: 1080, end: 1140, level: 'busy' })
    expect(JSON.stringify(found.body)).not.toContain('Uni timetable')
    const busy = await inContext(() => personsBusy([ana.accountId!], Date.UTC(2026, 11, 1), Date.UTC(2026, 11, 2)))
    expect(busy).toEqual([expect.objectContaining({ from: Date.UTC(2026, 11, 1, 18), to: Date.UTC(2026, 11, 1, 19), kind: 'unavailable', firm: false, labelKey: 'availability.unavailable' })])
  })
})

describe('refreshing, failing and disconnecting (I5, T-AV-35)', () => {
  it('fails, breaks after three, tells the person once, keeps blocks a week, recovers on refresh and deletes at once on disconnect', async () => {
    const { body: { connectionId: id } } = await plug(ben, { label: 'Work' })
    answer = () => new Response('gone', { status: 404 })
    await run(unit => refreshJob(unit, id))
    expect(await stateOf(id)).toEqual({ state: 'failing', failures: 1 })
    await run(unit => refreshJob(unit, id))
    await run(unit => refreshJob(unit, id))
    expect(await stateOf(id)).toEqual({ state: 'broken', failures: 3 })
    await run(unit => refreshJob(unit, id))
    expect(await stateOf(id)).toEqual({ state: 'broken', failures: 3 })
    expect(await told(ben)).toBe(1)

    setClock(NOV_24 + 6 * 86_400_000)
    await run(syncCalendars)
    expect((await blocksOf(id)).length).toBe(2)
    setClock(NOV_24 + 8 * 86_400_000)
    await run(syncCalendars)
    expect(await blocksOf(id)).toEqual([])

    answer = () => new Response(UNI)
    expect((await req(ben, 'POST', `/api/availability/calendars/${id}/refresh`, {})).body).toEqual({ state: 'active' })
    expect((await req(ben, 'POST', `/api/availability/calendars/${id}/refresh`, {})).body.code).toBe('availability.calendar.too-soon')
    expect(await stateOf(id)).toEqual({ state: 'active', failures: 0 })
    expect((await blocksOf(id)).length).toBe(1)

    expect((await req(ben, 'PUT', `/api/availability/calendars/${id}`, { label: 'Day job', tentativeAs: 'busy' })).status).toBe(200)
    expect((await req(ben, 'POST', `/api/availability/calendars/${id}/disconnect`, {})).status).toBe(200)
    expect(await blocksOf(id)).toEqual([])
    expect(await rows('SELECT id FROM availability_calendar_connections WHERE id = ?', id)).toEqual([])
    setClock(NOV_24)
  })
})

describe('erasing a person (I5, staged erasure)', () => {
  it('deletes their connections, sealed address included, and every imported block', async () => {
    const eve = await account('Eve')
    const { body: { connectionId: id } } = await plug(eve, { label: 'Lectures' })
    expect((await blocksOf(id)).length).toBe(2)
    await inContext(() => eraseAccount(eve.accountId!))
    expect(await blocksOf(id)).toEqual([])
    expect(await rows('SELECT id FROM availability_calendar_connections WHERE account_id = ?', eve.accountId)).toEqual([])
  })
})
