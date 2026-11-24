// Polls (AV-15, AV-16): sending, answering in private, deciding and giving up, the daily give-up and
// retention (T-AV-20, T-AV-21, T-AV-30).
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import sendPost from '../../server/api/availability/polls/index.post'
import mine from '../../server/api/availability/polls/index.get'
import sent from '../../server/api/availability/polls/sent.get'
import view from '../../server/api/availability/polls/[id]/index.get'
import answers from '../../server/api/availability/polls/[id]/answers.put'
import decidePost from '../../server/api/availability/polls/[id]/decide.post'
import abandonPost from '../../server/api/availability/polls/[id]/abandon.post'
import newException from '../../server/api/availability/exceptions/index.post'
import { sweepPolls } from '../../server/polls'

const app = server({
  'POST /api/availability/polls': sendPost,
  'GET /api/availability/polls': mine,
  'GET /api/availability/polls/sent': sent,
  'GET /api/availability/polls/:id': view,
  'PUT /api/availability/polls/:id/answers': answers,
  'POST /api/availability/polls/:id/decide': decidePost,
  'POST /api/availability/polls/:id/abandon': abandonPost,
  'POST /api/availability/exceptions': newException,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)
const TUESDAY = '2027-01-12'

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
const poll = (fields: Record<string, unknown> = {}) => ({
  title: 'Read-through', groupIds: ['crews:poll'], accountIds: [], must: [], spaceIds: [], length: 60,
  slots: [{ date: TUESDAY, start: 1080 }, { date: TUESDAY, start: 1200 }], answersBy: '2026-12-01', ...fields,
})

let ana: Actor, ben: Actor, cat: Actor, planner: Actor

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('occupancy', true)
  await setModule('crews', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  ;[ana, ben, cat] = [await account('Ana'), await account('Ben'), await account('Cat')]
  planner = await account('Pat')
  planner.grants = [{ ability: 'availability.find.use', via: 'role' }] as Actor['grants']
  crews.set('crews:poll', { label: 'Poll crew', members: [ana.accountId!, ben.accountId!, cat.accountId!], planners: [planner.accountId!] })
  expect((await req(ana, 'POST', '/api/availability/exceptions', { firstDate: TUESDAY, lastDate: TUESDAY, weekdays: null, from: '18:00', until: '19:00', level: 'busy', reason: null, reasonShared: false })).status).toBe(200)
})

describe('sending a poll (F7, AV-15)', () => {
  it('asks the group once, refuses fewer than two times, past times, and groups one does not plan for', async () => {
    expect((await req(planner, 'POST', '/api/availability/polls', poll({ slots: [{ date: TUESDAY, start: 1080 }] }))).status).toBe(422)
    expect((await req(planner, 'POST', '/api/availability/polls', poll({ slots: [{ date: '2026-11-23', start: 1080 }, { date: TUESDAY, start: 1080 }] }))).body.code).toBe('availability.poll.past')
    expect((await req(person(['availability.find.use']), 'POST', '/api/availability/polls', poll())).status).toBe(403)
    const made = await req(planner, 'POST', '/api/availability/polls', poll())
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.asked).toBe(3)
    expect(await told('availability.poll-asked', ana)).toBe(1)
    expect(await told('availability.poll-asked', planner)).toBe(0)
    expect((await req(ana, 'GET', '/api/availability/polls')).body.polls).toMatchObject([{ id: made.body.pollId, title: 'Read-through', open: true, answered: 0 }])
  })
})

describe('answering in private (F7, T-AV-20)', () => {
  it('shows each person only their own answers and level, the organiser everything, and changes no availability', async () => {
    const { body: { pollId } } = await req(planner, 'POST', '/api/availability/polls', poll({ title: 'Private' }))
    const before = await rows('SELECT count(*) AS n FROM availability_exceptions')
    const own = await req(ana, 'GET', `/api/availability/polls/${pollId}`)
    expect(own.status).toBe(200)
    const [six, eight] = own.body.slots
    expect(own.body.myLevels).toEqual({ [six.id]: 'busy', [eight.id]: 'unknown' })
    expect((await req(ana, 'PUT', `/api/availability/polls/${pollId}/answers`, { answers: [{ slotId: six.id, answer: 'no' }, { slotId: eight.id, answer: 'yes' }] })).status).toBe(200)
    expect((await req(ben, 'PUT', `/api/availability/polls/${pollId}/answers`, { answers: [{ slotId: eight.id, answer: 'if-need-be' }] })).status).toBe(200)
    expect((await req(ana, 'PUT', `/api/availability/polls/${pollId}/answers`, { answers: [{ slotId: six.id, answer: 'if-need-be' }] })).status).toBe(200)

    const ben2 = await req(ben, 'GET', `/api/availability/polls/${pollId}`)
    expect(ben2.body.mine).toEqual({ [eight.id]: 'if-need-be' })
    expect(ben2.body.tallies).toBeUndefined()
    expect(ben2.body.people).toBeUndefined()
    expect((await req(person([]), 'GET', `/api/availability/polls/${pollId}`)).status).toBe(404)

    const organiser = await req(planner, 'GET', `/api/availability/polls/${pollId}`)
    expect(organiser.body.tallies).toEqual({ [six.id]: { 'yes': 0, 'if-need-be': 1, 'no': 0 }, [eight.id]: { 'yes': 1, 'if-need-be': 1, 'no': 0 } })
    expect(organiser.body.people.find((p: { name: string }) => p.name === 'Ana').answers).toEqual({ [six.id]: 'if-need-be', [eight.id]: 'yes' })
    expect(await rows('SELECT count(*) AS n FROM availability_exceptions')).toEqual(before)
    expect((await req(planner, 'GET', '/api/availability/polls/sent')).body.polls.find((p: { id: string }) => p.id === pollId)).toMatchObject({ asked: 3, answered: 2 })
  })
})

describe('deciding and giving up (F8, AV-16)', () => {
  it('lets only the organiser decide once, tells everyone asked, and stops answers', async () => {
    const { body: { pollId } } = await req(planner, 'POST', '/api/availability/polls', poll({ title: 'Decide' }))
    const { body: { slots } } = await req(planner, 'GET', `/api/availability/polls/${pollId}`)
    expect((await req(ana, 'POST', `/api/availability/polls/${pollId}/decide`, { slotId: slots[1].id })).status).toBe(403)
    expect((await req(planner, 'POST', `/api/availability/polls/${pollId}/decide`, { slotId: slots[1].id })).status).toBe(200)
    expect((await req(planner, 'POST', `/api/availability/polls/${pollId}/abandon`, {})).body.code).toBe('availability.poll.finished')
    expect((await req(cat, 'PUT', `/api/availability/polls/${pollId}/answers`, { answers: [{ slotId: slots[0].id, answer: 'yes' }] })).body.code).toBe('availability.poll.closed')
    expect(await told('availability.poll-decided', cat)).toBe(1)
    const seen = await req(cat, 'GET', `/api/availability/polls/${pollId}`)
    expect(seen.body.poll).toMatchObject({ state: 'decided', decidedSlotId: slots[1].id, open: false })

    const { body: { pollId: other } } = await req(planner, 'POST', '/api/availability/polls', poll({ title: 'Give up' }))
    expect((await req(planner, 'POST', `/api/availability/polls/${other}/abandon`, {})).status).toBe(200)
    expect(await told('availability.poll-abandoned', ben)).toBe(1)
  })
})

describe('the daily give-up and retention (F8, T-AV-21, T-AV-30)', () => {
  it('gives up a poll 14 days past its answer date, tells everyone once, and deletes it a year after', async () => {
    const { body: { pollId } } = await req(planner, 'POST', '/api/availability/polls', poll({ title: 'Stale' }))
    const [expired, abandoned] = [await told('availability.poll-expired', planner), await told('availability.poll-abandoned', ana)]
    const open = (await rows('SELECT count(*) AS n FROM availability_finds WHERE state = \'polling\'') as { n: number }[])[0]!.n
    setClock(Date.UTC(2026, 11, 14, 5))
    await run(sweepPolls)
    expect(await rows('SELECT state FROM availability_finds WHERE id = ?', pollId)).toEqual([{ state: 'polling' }])
    setClock(Date.UTC(2026, 11, 16, 5))
    await run(sweepPolls)
    await run(sweepPolls)
    expect(await rows('SELECT state FROM availability_finds WHERE id = ?', pollId)).toEqual([{ state: 'abandoned' }])
    expect(await told('availability.poll-expired', planner)).toBe(expired + open)
    expect(await told('availability.poll-abandoned', ana)).toBe(abandoned + open)
    setClock(Date.UTC(2027, 11, 17, 5))
    await run(sweepPolls)
    expect(await rows('SELECT count(*) AS n FROM availability_finds WHERE id = ?', pollId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM availability_find_slots WHERE find_id = ?', pollId)).toEqual([{ n: 0 }])
  })
})
