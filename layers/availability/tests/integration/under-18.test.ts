// Under-18 warnings (F6, AV-14, T-AV-19): late finishes and one-to-one finds, from core's ageStatus
// only, shown to the organiser and never blocking.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import findPost from '../../server/api/availability/find/index.post'
import arrangePost from '../../server/api/availability/meetings/index.post'
import view from '../../server/api/availability/meetings/[id]/index.get'
import { lateFor } from '../../shared/find'

const app = server({
  'POST /api/availability/find': findPost,
  'POST /api/availability/meetings': arrangePost,
  'GET /api/availability/meetings/:id': view,
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

async function account(name: string, turns18On?: string): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, name, NOV_24, NOV_24)
  if (turns18On) await rows('INSERT INTO core_age_markers (account_id, turns_18_on, source, recorded_by, recorded_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, turns18On, who.accountId, NOV_24)
  return who
}

const ask = (groupId: string) => ({ groupIds: [groupId], accountIds: [], must: [], from: TUESDAY, to: TUESDAY, hoursFrom: '20:00', hoursTo: '23:30', length: 60, spaceIds: [], roomOptional: false })
const latest = (value: string | null) => run(unit => changeSetting(unit, 'core.under-18.latest-finish', value, { reason: 'test', confirm: true }))

let young: Actor, turned: Actor, adult: Actor, planner: Actor

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('occupancy', true)
  await setModule('crews', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  young = await account('Yan', '2027-03-01')
  turned = await account('Tia', '2027-01-11')
  adult = await account('Ada')
  planner = await account('Pip')
  planner.grants = ['availability.find.use', 'availability.meeting.arrange'].map(ability => ({ ability, via: 'role' })) as Actor['grants']
  crews.set('crews:u18', { label: 'Late crew', members: [young.accountId!, turned.accountId!, adult.accountId!], planners: [planner.accountId!] })
  crews.set('crews:pair', { label: 'Pair', members: [young.accountId!, adult.accountId!], planners: [planner.accountId!] })
})

describe('late finishes (F6, T-AV-19)', () => {
  it('warns of nobody while the latest finish is unset', async () => {
    const found = await req(planner, 'POST', '/api/availability/find', ask('crews:u18'))
    expect(found.body.under18).toEqual({ lateFinish: null, late: {}, oneToOne: false })
  })

  it('names only who is under 18 on the date, for slots ending after the latest finish', async () => {
    await latest('22:00')
    const found = await req(planner, 'POST', '/api/availability/find', ask('crews:u18'))
    expect(found.body.under18).toEqual({ lateFinish: 1320, late: { [TUESDAY]: [young.accountId] }, oneToOne: false })
    expect(lateFor(found.body.under18, { date: TUESDAY, end: 1380 })).toEqual([young.accountId])
    expect(lateFor(found.body.under18, { date: TUESDAY, end: 1320 })).toEqual([])
    expect(found.body.best.length).toBeGreaterThan(0)
  })
})

describe('one-to-one (F6, M6)', () => {
  it('warns once for one adult and one under-18, in a find and on the meeting, to the organiser only', async () => {
    expect((await req(planner, 'POST', '/api/availability/find', ask('crews:pair'))).body.under18.oneToOne).toBe(true)
    const made = await req(planner, 'POST', '/api/availability/meetings', { title: 'Late notes', date: TUESDAY, start: 1290, end: 1380, place: null, notes: null, groupIds: ['crews:pair'], accountIds: [], findId: null })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect((await req(planner, 'GET', `/api/availability/meetings/${made.body.meetingId}`)).body.under18).toEqual({ late: ['Yan'], oneToOne: true })
    expect((await req(adult, 'GET', `/api/availability/meetings/${made.body.meetingId}`)).body.under18).toBeUndefined()
    await run(unit => changeSetting(unit, 'availability.safeguarding.one-to-one', false, { reason: 'test', confirm: true }))
    expect((await req(planner, 'POST', '/api/availability/find', ask('crews:pair'))).body.under18.oneToOne).toBe(false)
    await latest(null)
  })
})
