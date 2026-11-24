// Requests after opening (AV-09, AV-10, S4, S5, S11): reminders before the due date and "Remind now",
// joiners and leavers by the daily task, withdrawing a person, and what the organiser and the asked see.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import newRequest from '../../server/api/availability/requests/index.post'
import mine from '../../server/api/availability/requests/index.get'
import sent from '../../server/api/availability/requests/sent.get'
import view from '../../server/api/availability/requests/[id]/index.get'
import answerRequest from '../../server/api/availability/requests/[id]/answer.post'
import closeRequest from '../../server/api/availability/requests/[id]/close.post'
import remind from '../../server/api/availability/requests/[id]/remind.post'
import withdrawPerson from '../../server/api/availability/requests/[id]/withdraw.post'
import { sendReminders, sweepRequests } from '../../server/requests'

const app = server({
  'POST /api/availability/requests': newRequest,
  'GET /api/availability/requests': mine,
  'GET /api/availability/requests/sent': sent,
  'GET /api/availability/requests/:id': view,
  'POST /api/availability/requests/:id/answer': answerRequest,
  'POST /api/availability/requests/:id/close': closeRequest,
  'POST /api/availability/requests/:id/remind': remind,
  'POST /api/availability/requests/:id/withdraw': withdrawPerson,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)
const on = (day: number, hour = 9) => Date.UTC(2026, 11, day, hour)

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

const told = async (type: string, who: Actor) => ((await rows('SELECT count(*) AS n FROM core_notifications WHERE type_key = ? AND account_id = ?', type, who.accountId)) as { n: number }[])[0]!.n

async function open(planner: Actor, groupId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const made = await req(planner, 'POST', '/api/availability/requests', { title: 'Spring term', message: 'Mark your exams, please.', groupIds: [groupId], accountIds: [], from: '2027-01-11', to: '2027-03-19', dueOn: '2026-12-10', ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.requestId
}

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('crews', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
})

describe('reminders (R3, T-AV-13)', () => {
  it('reminds at each setting before the due date, never someone who has answered, and nothing after closing', async () => {
    setClock(on(1))
    const [ana, ben] = [await account('Ana'), await account('Ben')]
    const planner = person(['availability.request.send'])
    crews.set('crews:reminded', { label: 'Reminded', members: [ana.accountId!, ben.accountId!], planners: [planner.accountId!] })
    const id = await open(planner, 'crews:reminded')

    await run(sendReminders)
    expect(await told('availability.request-reminder', ana)).toBe(0)
    setClock(on(7))
    await run(sendReminders)
    await run(sendReminders)
    expect([await told('availability.request-reminder', ana), await told('availability.request-reminder', ben)]).toEqual([1, 1])

    expect((await req(ana, 'POST', `/api/availability/requests/${id}/answer`, {})).status).toBe(200)
    setClock(on(9))
    await run(sendReminders)
    expect([await told('availability.request-reminder', ana), await told('availability.request-reminder', ben)]).toEqual([1, 2])

    const other = await open(planner, 'crews:reminded', { title: 'Summer', dueOn: '2026-12-12' })
    expect((await req(planner, 'POST', `/api/availability/requests/${other}/close`, {})).status).toBe(200)
    setClock(on(11))
    await run(sendReminders)
    expect(await told('availability.request-reminder', ben)).toBe(2)
  })

  it('lets the organiser remind everyone still asked once a day, and nobody else', async () => {
    setClock(on(2))
    const [ana, ben] = [await account('Ana'), await account('Ben')]
    const planner = person(['availability.request.send'])
    crews.set('crews:nudged', { label: 'Nudged', members: [ana.accountId!, ben.accountId!], planners: [planner.accountId!] })
    const id = await open(planner, 'crews:nudged', { dueOn: '2026-12-20' })
    expect((await req(ana, 'POST', `/api/availability/requests/${id}/answer`, {})).status).toBe(200)

    expect((await req(person(['availability.request.send']), 'POST', `/api/availability/requests/${id}/remind`, {})).status).toBe(403)
    const first = await req(planner, 'POST', `/api/availability/requests/${id}/remind`, {})
    expect(first.body).toEqual({ reminded: 1 })
    expect([await told('availability.request-reminder', ana), await told('availability.request-reminder', ben)]).toEqual([0, 1])
    const again = await req(planner, 'POST', `/api/availability/requests/${id}/remind`, {})
    expect([again.status, again.body.code]).toEqual([409, 'availability.request.reminded-today'])
    setClock(on(3, 10))
    expect((await req(planner, 'POST', `/api/availability/requests/${id}/remind`, {})).status).toBe(200)
  })
})

describe('joiners and leavers (R2, R6, T-AV-14)', () => {
  it('asks and tells someone who joins, withdraws someone who leaves, and keeps people named', async () => {
    setClock(on(1))
    const [ana, ben, cat, dan] = [await account('Ana'), await account('Ben'), await account('Cat'), await account('Dan')]
    const planner = person(['availability.request.send'])
    crews.set('crews:moving', { label: 'Moving', members: [ana.accountId!, ben.accountId!, dan.accountId!], planners: [planner.accountId!] })
    const id = await open(planner, 'crews:moving', { accountIds: [dan.accountId] })

    crews.set('crews:moving', { label: 'Moving', members: [ben.accountId!, cat.accountId!], planners: [planner.accountId!] })
    setClock(on(2, 4))
    await run(sweepRequests)
    const states = await rows('SELECT account_id AS who, state FROM availability_request_people WHERE request_id = ? ORDER BY account_id', id)
    expect(Object.fromEntries((states as { who: string, state: string }[]).map(s => [s.who, s.state]))).toEqual({
      [ana.accountId!]: 'withdrawn', [ben.accountId!]: 'asked', [cat.accountId!]: 'asked', [dan.accountId!]: 'asked',
    })
    expect(await told('availability.request-opened', cat)).toBe(1)
    await run(sweepRequests)
    expect(await told('availability.request-opened', cat)).toBe(1)
  })
})

describe('what each person sees (S4, S5, S11)', () => {
  it('shows the organiser everyone by name with counts, the asked only their own state, and a stranger nothing', async () => {
    setClock(on(1))
    const [ana, ben] = [await account('Ana'), await account('Ben')]
    const planner = person(['availability.request.send'])
    crews.set('crews:seen', { label: 'Seen', members: [ana.accountId!, ben.accountId!], planners: [planner.accountId!] })
    const id = await open(planner, 'crews:seen', { title: 'Panto' })
    expect((await req(ben, 'POST', `/api/availability/requests/${id}/answer`, {})).status).toBe(200)

    const list = await req(planner, 'GET', '/api/availability/requests/sent')
    expect(list.body.groups).toContainEqual({ id: 'crews:seen', label: 'Seen' })
    expect(list.body.defaultDue).toBe('2026-12-08')
    expect(list.body.requests.find((r: { id: string }) => r.id === id)).toMatchObject({ title: 'Panto', open: true, counts: { asked: 1, answered: 1, lapsed: 0, withdrawn: 0 } })

    const full = await req(planner, 'GET', `/api/availability/requests/${id}`)
    expect(full.body).toMatchObject({ organiser: true, mine: null, request: { title: 'Panto', message: 'Mark your exams, please.' } })
    expect(full.body.people.map((p: { name: string, state: string }) => `${p.name} ${p.state}`)).toEqual(['Ana asked', 'Ben answered'])

    const asked = await req(ana, 'GET', `/api/availability/requests/${id}`)
    expect(asked.body).toMatchObject({ organiser: false, mine: 'asked' })
    expect(asked.body.people).toBeUndefined()
    expect((await req(ana, 'GET', '/api/availability/requests')).body.requests.map((r: { title: string }) => r.title)).toContain('Panto')
    expect((await req(await account('Stranger'), 'GET', `/api/availability/requests/${id}`)).status).toBe(404)

    expect((await req(ana, 'POST', `/api/availability/requests/${id}/withdraw`, { accountId: ben.accountId })).status).toBe(403)
    expect((await req(planner, 'POST', `/api/availability/requests/${id}/withdraw`, { accountId: ana.accountId })).status).toBe(200)
    expect((await req(planner, 'POST', `/api/availability/requests/${id}/withdraw`, { accountId: ana.accountId })).status).toBe(409)
    expect((await req(ana, 'GET', '/api/availability/requests')).body.requests.map((r: { title: string }) => r.title)).not.toContain('Panto')
  })
})
