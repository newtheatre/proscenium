// Run presets and the show's defaults (run presets concept, Matt 2026-11-17): a run's start times
// each have their own days, so a matinee can be on Saturdays only; presets keep those start times; a
// performance takes the production's running time, doors and capacity over its space's over the
// theatre's; and the turnaround keeps performances in one space apart.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import patchProduction from '../../server/api/core/productions/[id]/index.patch'
import addPerformance from '../../server/api/core/productions/[id]/performances/index.post'
import listPerformances from '../../server/api/core/productions/[id]/performances/index.get'
import plan from '../../server/api/core/productions/[id]/performances/plan.post'
import savePreset from '../../server/api/core/productions/[id]/run-presets/index.post'
import patchPerformance from '../../server/api/core/performances/[id]/index.patch'
import schedule from '../../server/api/core/performances/[id]/schedule.post'
import createVenue from '../../server/api/core/venues/index.post'
import patchSpace from '../../server/api/core/venues/[id]/spaces/[space]/index.patch'
import listPresets from '../../server/api/core/run-presets/index.get'
import createPreset from '../../server/api/core/run-presets/index.post'
import putPreset from '../../server/api/core/run-presets/[id]/index.put'
import deletePreset from '../../server/api/core/run-presets/[id]/index.delete'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'GET /api/core/productions/:id/performances': listPerformances,
  'POST /api/core/productions/:id/performances/plan': plan,
  'POST /api/core/productions/:id/run-presets': savePreset,
  'PATCH /api/core/performances/:id': patchPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/venues': createVenue,
  'PATCH /api/core/venues/:id/spaces/:space': patchSpace,
  'GET /api/core/run-presets': listPresets,
  'POST /api/core/run-presets': createPreset,
  'PUT /api/core/run-presets/:id': putPreset,
  'DELETE /api/core/run-presets/:id': deletePreset,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'core.programme.configure'])
const scheduler = person(['core.performance.schedule'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object, actor = admin) => json(call(handle, method, path, { actor, body }))
const MINUTE = 60_000

let n = 0
async function stage(): Promise<{ productionId: string, venueId: string, spaceId: string }> {
  const production = await req('POST', '/api/core/productions', { title: `Preset ${++n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Preset venue ${n}` })
  return { productionId: production.body.id, venueId: venue.body.venueId, spaceId: venue.body.spaceId }
}
async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, key as never, value, { confirm: true })
    await unit.commit()
  })
}

beforeEach(async () => {
  resetRateLimits()
  await setting('core.locale.time-zone', 'Europe/London')
})
afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare('UPDATE core_spaces SET run_preset_id = NULL'),
    env.DB.prepare('DELETE FROM core_run_presets'),
    env.DB.prepare("DELETE FROM core_settings WHERE key IN ('core.locale.time-zone', 'core.programme.turnaround', 'core.programme.run-preset')"),
  ])
})

describe('a run with start times by day', () => {
  it('puts the matinee on Saturdays only', async () => {
    const s = await stage()
    // Monday 3 to Sunday 9 January 2028: evenings Tuesday to Saturday, a matinee on Saturday.
    const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, {
      venueId: s.venueId, spaceId: s.spaceId, from: '2028-01-03', to: '2028-01-09',
      slots: [{ days: [2, 3, 4, 5, 6], times: ['19:30'] }, { days: [6], times: ['14:30'] }],
    })
    expect(status, JSON.stringify(body)).toBe(200)
    const starts = (body.performances as { startsAt: number }[]).map(p => new Date(p.startsAt).toISOString().slice(0, 16))
    expect(starts).toEqual(['2028-01-04T19:30', '2028-01-05T19:30', '2028-01-06T19:30', '2028-01-07T19:30', '2028-01-08T14:30', '2028-01-08T19:30'])
  })

  it('still takes one list of days and times', async () => {
    const s = await stage()
    const { body } = await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, { venueId: s.venueId, spaceId: s.spaceId, from: '2028-01-03', to: '2028-01-09', days: [6], times: ['14:30', '19:30'] })
    expect(body.performances).toHaveLength(2)
  })

  it('keeps performances in one space apart by the turnaround', async () => {
    const s = await stage()
    // The theatre's two hours from 19:30 ends at 21:30; with an hour's turnaround, 22:00 the same night clashes.
    const first = await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.spaceId, startsAt: Date.parse('2028-01-05T19:30:00Z') })
    expect((await req('POST', `/api/core/performances/${first.body.id}/schedule`)).status).toBe(200)
    const late = { venueId: s.venueId, spaceId: s.spaceId, from: '2028-01-05', to: '2028-01-05', days: [3], times: ['22:00'] }
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, late)).body.performances[0].problem).toBeNull()
    await setting('core.programme.turnaround', 3600)
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances/plan`, late)).body.performances[0].problem).toBe('clash')
  })
})

describe("a performance's defaults", () => {
  it('come from the production, then the space, then the theatre', async () => {
    const s = await stage()
    const at = Date.parse('2028-02-01T19:30:00Z')
    const performance = async () => {
      const { body } = await req('GET', `/api/core/productions/${s.productionId}/performances`)
      return body.performances.at(-1) as { id: string, startsAt: number, endsAt: number, doorsAt: number, capacity: number | null }
    }
    // The theatre's: two hours, doors 30 minutes before.
    await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.spaceId, startsAt: at })
    let p = await performance()
    expect([p.endsAt - at, at - p.doorsAt]).toEqual([120 * MINUTE, 30 * MINUTE])
    // The space's doors over the theatre's.
    expect((await req('PATCH', `/api/core/venues/${s.venueId}/spaces/${s.spaceId}`, { doorsBeforeMinutes: 45 })).status).toBe(200)
    await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.spaceId, startsAt: at + 86_400_000 })
    p = await performance()
    expect(p.startsAt - p.doorsAt).toBe(45 * MINUTE)
    // The production's over the space's.
    expect((await req('PATCH', `/api/core/productions/${s.productionId}`, { runningMinutes: 150, doorsBeforeMinutes: 20, capacity: 80 })).status).toBe(200)
    await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.spaceId, startsAt: at + 2 * 86_400_000 })
    p = await performance()
    expect([p.endsAt - p.startsAt, p.startsAt - p.doorsAt]).toEqual([150 * MINUTE, 20 * MINUTE])
    const { body } = await req('GET', `/api/core/productions/${s.productionId}/performances`)
    expect(body.defaults).toMatchObject({ runningMinutes: 150, productionDoorsBeforeMinutes: 20, productionCapacity: 80, intervalCount: 1 })
    // A performance's own running time, and an edit that moves the start moves the end with it.
    expect((await req('PATCH', `/api/core/performances/${p.id}`, { startsAt: p.startsAt + 60 * MINUTE, runningMinutes: 90 })).status).toBe(200)
    const moved = await performance()
    expect(moved.endsAt - moved.startsAt).toBe(90 * MINUTE)
  })
})

describe('run presets', () => {
  it('are saved by anyone who adds runs, and changed and deleted in Admin', async () => {
    const s = await stage()
    const slots = [{ days: [6, 2, 3, 4, 5], times: ['19:30'] }, { days: [6], times: ['14:30'] }]
    const saved = await req('POST', `/api/core/productions/${s.productionId}/run-presets`, { name: 'Evenings and a Saturday matinee', slots }, scheduler)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const again = await req('POST', '/api/core/run-presets', { name: 'evenings and a saturday matinee', slots })
    expect([again.status, again.body.code]).toEqual([409, 'core.run-preset.name-taken'])
    expect((await req('GET', '/api/core/run-presets', undefined, scheduler)).status).toBe(403)

    // A space may start from it; deleting it puts the space back on the theatre's.
    expect((await req('PATCH', `/api/core/venues/${s.venueId}/spaces/${s.spaceId}`, { runPresetId: saved.body.id })).status).toBe(200)
    const list = await req('GET', '/api/core/run-presets')
    expect(list.body.rows).toEqual([{ id: saved.body.id, name: 'Evenings and a Saturday matinee', slots: [{ days: [2, 3, 4, 5, 6], times: ['19:30'] }, { days: [6], times: ['14:30'] }], spaces: 1 }])
    expect((await req('PUT', `/api/core/run-presets/${saved.body.id}`, { name: 'Evenings', slots: [{ days: [2, 3, 4, 5, 6], times: ['19:30'] }] })).status).toBe(200)
    expect((await req('DELETE', `/api/core/run-presets/${saved.body.id}`)).status).toBe(200)
    expect(await rows('SELECT run_preset_id FROM core_spaces WHERE id = ?', s.spaceId)).toEqual([{ run_preset_id: null }])
  })

  it('are refused for a space when they do not exist', async () => {
    const s = await stage()
    const { status, body } = await req('PATCH', `/api/core/venues/${s.venueId}/spaces/${s.spaceId}`, { runPresetId: 'rps_aaaaaaaaaaaaaaaaaaaaaaaaaa' })
    expect([status, body.code]).toEqual([422, 'core.space.preset-unknown'])
  })
})
