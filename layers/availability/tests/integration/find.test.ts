// Find a time (AV-11 to AV-13): who is in a find, the grid's levels, best times with must-have people,
// and rooms taken (T-AV-15 to T-AV-18).
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import createVenue from '../../../core/server/api/core/venues/index.post'
import findPost from '../../server/api/availability/find/index.post'
import options from '../../server/api/availability/find/options.get'
import newException from '../../server/api/availability/exceptions/index.post'

const app = server({
  'POST /api/core/venues': createVenue,
  'POST /api/availability/find': findPost,
  'GET /api/availability/find/options': options,
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

const mark = (who: Actor, from: string, until: string, level: string) => req(who, 'POST', '/api/availability/exceptions', { firstDate: TUESDAY, lastDate: TUESDAY, weekdays: null, from, until, level, reason: null, reasonShared: false })
const ask = (fields: Record<string, unknown>) => ({ groupIds: [], accountIds: [], must: [], from: TUESDAY, to: TUESDAY, hoursFrom: '17:00', hoursTo: '22:00', length: 60, spaceIds: [], roomOptional: false, ...fields })

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
  crews.set('crews:find', { label: 'Find crew', members: [ana.accountId!, ben.accountId!, cat.accountId!], planners: [planner.accountId!] })
  expect((await mark(ana, '17:00', '22:00', 'free')).status).toBe(200)
  expect((await mark(ana, '18:00', '20:00', 'busy')).status).toBe(200)
  expect((await mark(ben, '19:00', '20:00', 'maybe')).status).toBe(200)
})

describe('who is in a find (F1, T-AV-15)', () => {
  it('holds the group\'s people for its planner, refuses a group they do not plan for, and offers their groups', async () => {
    const found = await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'] }))
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people.map((p: { name: string }) => p.name)).toEqual(['Ana', 'Ben', 'Cat'])
    expect((await req(person(['availability.find.use']), 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'] }))).status).toBe(403)
    expect((await req(planner, 'GET', '/api/availability/find/options')).body.groups).toContainEqual({ id: 'crews:find', label: 'Find crew' })
  })
})

describe('the grid and best times (F2, F3, T-AV-16, T-AV-17)', () => {
  it('gives each person\'s day, and ranks slots where every must-have person is free', async () => {
    const found = await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], must: [ana.accountId] }))
    const anaDay = found.body.weeks[ana.accountId!][TUESDAY]
    expect(anaDay).toContainEqual({ start: 1080, end: 1200, level: 'busy' })
    expect(found.body.best[0]).toMatchObject({ date: TUESDAY, start: 1020, end: 1080, free: 1, maybe: 0, unknown: 2 })
    expect(found.body.best.every((s: { start: number, end: number }) => s.end <= 1080 || s.start >= 1200)).toBe(true)
    const loose = await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'] }))
    expect(loose.body.best.length).toBe(9)
    expect(loose.body.best.at(-1)).toMatchObject({ start: 1170, busy: 1, maybe: 1 })
  })

  it('refuses a window over 62 days, hours off the step and a length that does not fit', async () => {
    expect((await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], to: '2027-03-31' }))).body.code).toBe('availability.window')
    expect((await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], hoursFrom: '17:10' }))).body.code).toBe('availability.hours')
    expect((await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], length: 600 }))).body.code).toBe('availability.length')
  })
})

describe('rooms (F5, T-AV-18)', () => {
  it('leaves out slots when a chosen room is taken, unless the room is optional', async () => {
    const admin = person(['core.venue.manage'])
    const made = await req(admin, 'POST', '/api/core/venues', { name: 'Find venue' })
    const space = made.body.spaceId as string
    await env.DB.prepare('INSERT INTO core_closures (id, venue_id, space_id, kind, title, starts_at, ends_at, all_day, blocks_performances, source, created_at) VALUES (?, ?, ?, \'closure\', \'Get-out\', ?, ?, 0, 1, \'manual\', 0)')
      .bind(newId('clo'), made.body.venueId, space, Date.UTC(2027, 0, 12, 17), Date.UTC(2027, 0, 12, 18)).run()
    const found = await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], must: [ana.accountId], spaceIds: [space] }))
    expect(found.body.taken[TUESDAY]).toEqual([expect.objectContaining({ start: 1020, end: 1080 })])
    expect(found.body.best.some((s: { start: number }) => s.start === 1020)).toBe(false)
    const optional = await req(planner, 'POST', '/api/availability/find', ask({ groupIds: ['crews:find'], must: [ana.accountId], spaceIds: [space], roomOptional: true }))
    expect(optional.body.best[0].start).toBe(1020)
  })
})
