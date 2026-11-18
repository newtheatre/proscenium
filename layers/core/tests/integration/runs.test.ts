// C-04 and test plan's "The long run": a run is planned with every problem marked, saved whole or
// not at all within the kit's limit on rows in one unit, and made by a job in chunks beyond it. A
// chunk made twice makes nothing twice, and a run stopped part way can be finished or removed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import addPerformance from '../../server/api/core/productions/[id]/performances/index.post'
import listPerformances from '../../server/api/core/productions/[id]/performances/index.get'
import plan from '../../server/api/core/productions/[id]/performances/plan.post'
import addRun from '../../server/api/core/productions/[id]/performances/run.post'
import getRun from '../../server/api/core/productions/[id]/runs/[run]/index.get'
import finishRun from '../../server/api/core/productions/[id]/runs/[run]/finish.post'
import removeRun from '../../server/api/core/productions/[id]/runs/[run]/remove.post'
import undoRun from '../../server/api/core/productions/[id]/performances/undo.post'
import schedule from '../../server/api/core/performances/[id]/schedule.post'
import createVenue from '../../server/api/core/venues/index.post'
import createClosure from '../../server/api/core/closures/index.post'
import deleteClosure from '../../server/api/core/closures/[id]/index.delete'
import { runChunk } from '../../server/programme/runs'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, deliver, env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'GET /api/core/productions/:id/performances': listPerformances,
  'POST /api/core/productions/:id/performances/plan': plan,
  'POST /api/core/productions/:id/performances/run': addRun,
  'POST /api/core/productions/:id/performances/undo': undoRun,
  'GET /api/core/productions/:id/runs/:run': getRun,
  'POST /api/core/productions/:id/runs/:run/finish': finishRun,
  'POST /api/core/productions/:id/runs/:run/remove': removeRun,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/venues': createVenue,
  'POST /api/core/closures': createClosure,
  'DELETE /api/core/closures/:id': deleteClosure,
})
const admin = person(['core.production.create', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage', 'core.closure.manage'])
const scheduler = person(['core.performance.schedule'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object, actor = admin) => json(call(handle, method, path, { actor, body }))

let n = 0
async function stage(): Promise<{ productionId: string, venueId: string, spaceId: string }> {
  const production = await req('POST', '/api/core/productions', { title: `Run ${++n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Run venue ${n}` })
  return { productionId: production.body.id, venueId: venue.body.venueId, spaceId: venue.body.spaceId }
}
const pattern = (s: { venueId: string, spaceId: string }, extra: object) => ({ venueId: s.venueId, spaceId: s.spaceId, days: [1, 2, 3, 4, 5, 6, 7], times: ['19:30'], ...extra })
async function planned(s: { productionId: string, venueId: string, spaceId: string }, extra: object) {
  const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, pattern(s, extra))
  expect(status, JSON.stringify(body)).toBe(200)
  return body.performances as { startsAt: number, endsAt: number, doorsAt: number | null, operatingDay: string, problem: string | null, reason: string | null }[]
}
const keep = (list: Awaited<ReturnType<typeof planned>>) => list.filter(p => !p.problem).map(({ startsAt, endsAt, doorsAt }) => ({ startsAt, endsAt, doorsAt }))
const count = async (productionId: string, state?: string) =>
  (await rows<{ n: number }>(`SELECT count(*) AS n FROM core_performances WHERE production_id = ?${state ? ' AND state = ?' : ''}`, ...(state ? [productionId, state] : [productionId])))[0]!.n
async function setLimit(limit: number) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.units.set-rows-limit', limit, { confirm: true })
    await unit.commit()
  })
}

beforeEach(async () => {
  resetRateLimits()
  sent.length = 0
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
})
afterEach(async () => {
  sent.length = 0
  await env.DB.batch([
    env.DB.prepare('DELETE FROM core_closures'),
    env.DB.prepare("DELETE FROM core_settings WHERE key IN ('core.locale.time-zone', 'core.units.set-rows-limit')"),
  ])
})

describe('a run of performances', () => {
  it('is planned on the chosen days and times, with each problem marked', async () => {
    const s = await stage()
    const other = await stage()
    // Another production holds the space on Wednesday 5 January 2028 at 19:30.
    const theirs = await req('POST', `/api/core/productions/${other.productionId}/performances`, { venueId: s.venueId, spaceId: s.spaceId, startsAt: Date.parse('2028-01-05T19:30:00Z') })
    await req('POST', `/api/core/performances/${theirs.body.id}/schedule`, {})
    await req('POST', '/api/core/closures', { venueId: s.venueId, title: 'Deep clean', allDay: true, from: '2028-01-07', to: '2028-01-07' })

    // Monday to Saturday for a week, at 14:30 and 15:30: the second overlaps the first.
    const list = await planned(s, { from: '2028-01-03', to: '2028-01-09', days: [1, 2, 3, 4, 5, 6], times: ['15:30', '14:30'] })
    expect(list).toHaveLength(12)
    expect(list[0]).toMatchObject({ startsAt: Date.parse('2028-01-03T14:30:00Z'), doorsAt: Date.parse('2028-01-03T14:00:00Z'), endsAt: Date.parse('2028-01-03T16:30:00Z'), operatingDay: '2028-01-03', problem: null })
    expect(list[1]).toMatchObject({ problem: 'clash', reason: 'Another performance of this run is in the space then.' })
    expect(list.filter(p => p.problem === 'closed').map(p => p.operatingDay)).toEqual(['2028-01-07', '2028-01-07'])

    const evenings = await planned(s, { from: '2028-01-05', to: '2028-01-05', days: [3] })
    expect(evenings[0]).toMatchObject({ problem: 'clash', reason: expect.stringContaining('is already scheduled in this space then') })
    expect((await planned(s, { from: '2020-01-01', to: '2020-01-01' }))[0]!.problem).toBe('past')
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, pattern(s, { from: '2028-01-01', to: '2029-06-01' }))).body.code).toBe('core.run.too-long')
  })

  it('of 200 is saved whole in one unit, and a clash saves none of it', async () => {
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-02-01', to: '2028-08-18' }))
    expect(list).toHaveLength(200)
    const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list })
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body).toEqual({ created: 200, ids: expect.any(Array) })
    expect(await count(s.productionId, 'scheduled')).toBe(200)
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.scheduled' AND payload LIKE ?", `%${s.productionId}%`)).toHaveLength(200)

    // A second run, one of whose nights the first now holds, is refused whole.
    const t = await stage()
    const again = [...keep(await planned(s, { from: '2028-08-19', to: '2028-08-30' })), list[199]!]
    const refused = await req('POST', `/api/core/productions/${t.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: again })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.run.changed')
    expect(await count(t.productionId)).toBe(0)
  })

  it('can be added as drafts, which need no free space', async () => {
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-09-01', to: '2028-09-03' }))
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, scheduled: false, performances: list }, scheduler)).body).toMatchObject({ created: 3 })
    expect(await count(s.productionId, 'draft')).toBe(3)
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.scheduled' AND payload LIKE ?", `%${s.productionId}%`)).toEqual([])
  })

  it('planned again marks the dates the production already has as on the list', async () => {
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-11-01', to: '2028-11-03' }))
    await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, scheduled: false, performances: list.slice(0, 1) })
    await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list.slice(1) })
    const again = await planned(s, { from: '2028-11-01', to: '2028-11-03' })
    expect(again.map(p => p.problem)).toEqual(['exists', 'exists', 'exists'])
    expect(again[0]!.reason).toBe('Already on the list.')
  })

  it('just added can be undone, drafts and scheduled alike', async () => {
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-12-01', to: '2028-12-03' }))
    const added = await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list })
    expect(added.body.ids).toHaveLength(3)
    const undone = await req('POST', `/api/core/productions/${s.productionId}/performances/undo`, { ids: added.body.ids })
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    expect(undone.body).toEqual({ removed: 3 })
    expect(await count(s.productionId)).toBe(0)
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.cancelled' AND payload LIKE ?", `%${s.productionId}%`)).toHaveLength(3)
    // Another production's performance is not this one's to undo.
    const other = await stage()
    const theirs = await req('POST', `/api/core/productions/${other.productionId}/performances/run`, { venueId: other.venueId, spaceId: other.spaceId, scheduled: false, performances: list })
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances/undo`, { ids: theirs.body.ids })).body.code).toBe('core.run.undo-too-late')
    expect(await count(other.productionId)).toBe(3)
  })

  it('over the limit is made by the job in chunks, and a chunk made twice makes nothing twice', async () => {
    await setLimit(10)
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-10-01', to: '2028-10-25' }))
    const { body } = await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list })
    expect(body.run).toMatchObject({ total: 25, done: 0, state: 'running' })
    const runId = body.run.id

    // Two deliveries at once: whatever order they land in, nothing is made or announced twice.
    const chunk = () => inContext(async () => {
      const unit = createUnit()
      await runChunk(unit, runId)
      await unit.commit()
    }, { kind: 'job' })
    await Promise.all([chunk(), chunk()])
    const { done } = (await req('GET', `/api/core/productions/${s.productionId}/runs/${runId}`)).body
    expect([10, 20]).toContain(done)
    expect(await count(s.productionId)).toBe(done)
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.scheduled' AND payload LIKE ?", `%${s.productionId}%`)).toHaveLength(done)

    await deliver()
    expect((await req('GET', `/api/core/productions/${s.productionId}/runs/${runId}`)).body).toMatchObject({ done: 25, state: 'done' })
    expect(await count(s.productionId, 'scheduled')).toBe(25)
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.scheduled' AND payload LIKE ?", `%${s.productionId}%`)).toHaveLength(25)
    expect((await req('GET', `/api/core/productions/${s.productionId}/performances`)).body.runs).toEqual([])
  })

  it('stopped part way says why, and can be finished', async () => {
    await setLimit(10)
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-11-01', to: '2028-11-25' }))
    const { body } = await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list })
    const closure = await req('POST', '/api/core/closures', { venueId: s.venueId, title: 'Flood', allDay: true, from: '2028-11-15', to: '2028-11-15' })
    await deliver()
    const stopped = (await req('GET', `/api/core/productions/${s.productionId}/runs/${body.run.id}`)).body
    expect(stopped).toMatchObject({ done: 10, state: 'stopped', stopReason: '2028-11-15: The space is closed then: Flood.' })
    expect(await count(s.productionId)).toBe(10)
    expect((await req('GET', `/api/core/productions/${s.productionId}/performances`)).body.runs).toHaveLength(1)

    await req('DELETE', `/api/core/closures/${closure.body.id}`, {})
    expect((await req('POST', `/api/core/productions/${s.productionId}/runs/${body.run.id}/finish`, {})).status).toBe(200)
    await deliver()
    expect((await req('GET', `/api/core/productions/${s.productionId}/runs/${body.run.id}`)).body).toMatchObject({ done: 25, state: 'done' })
    expect(await count(s.productionId, 'scheduled')).toBe(25)
  })

  it('stopped part way can be removed: its scheduled performances are cancelled and its drafts deleted', async () => {
    await setLimit(10)
    const s = await stage()
    const list = keep(await planned(s, { from: '2028-12-01', to: '2028-12-25' }))
    const { body } = await req('POST', `/api/core/productions/${s.productionId}/performances/run`, { venueId: s.venueId, spaceId: s.spaceId, performances: list })
    await req('POST', '/api/core/closures', { venueId: s.venueId, title: 'Flood', allDay: true, from: '2028-12-15', to: '2028-12-15' })
    await deliver()
    expect((await req('POST', `/api/core/productions/${s.productionId}/runs/${body.run.id}/remove`, {}, scheduler)).status).toBe(403)
    expect((await req('POST', `/api/core/productions/${s.productionId}/runs/${body.run.id}/remove`, {})).body.state).toBe('removing')
    await deliver()
    expect((await req('GET', `/api/core/productions/${s.productionId}/runs/${body.run.id}`)).body.state).toBe('removed')
    expect(await count(s.productionId, 'cancelled')).toBe(10)
    expect(await count(s.productionId, 'scheduled')).toBe(0)
    expect((await rows<{ last_ends_at: number | null }>('SELECT last_ends_at FROM core_productions WHERE id = ?', s.productionId))[0]!.last_ends_at).toBeNull()
  })
})
