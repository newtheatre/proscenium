// C-62: a drop-in performance has opening hours within one operating day, no doors and no
// intervals, is guarded like any performance, is chosen only while a draft, and reads as hours.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createVenue from '../../server/api/core/venues/index.post'
import patchPerformance from '../../server/api/core/performances/[id]/index.patch'
import { createPerformance, createProduction, schedulePerformances } from '../../server/services'
import { changeSetting, createUnit, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const admin = person(['core.venue.manage', 'core.performance.schedule'])
const handle = server({ 'POST /api/core/venues': createVenue, 'PATCH /api/core/performances/:id': patchPerformance })
const req = async (method: string, path: string, body?: object) => {
  const r = await call(handle, method, path, { actor: admin, body })
  return { status: r.status, body: await r.json() as any }
}
const at = (iso: string) => Date.parse(iso)
const inUnit = <T>(fn: (unit: UnitView) => Promise<T>) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit)
  await unit.commit()
  return out
}, admin)

let n = 0
async function setting(): Promise<{ productionId: string, spaceId: string }> {
  const v = await req('POST', '/api/core/venues', { name: `Gallery ${++n}` })
  const productionId = await inUnit(unit => createProduction(unit, { title: `Exhibition ${n}`, kind: 'event' }))
  return { productionId, spaceId: v.body.spaceId }
}

beforeEach(async () => {
  resetRateLimits()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
})
afterEach(async () => {
  await env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.locale.time-zone'").run()
})

describe('a drop-in performance', () => {
  it('has opening hours and no doors or intervals, whatever the show\'s defaults say (DI2)', async () => {
    const s = await setting()
    const id = await inUnit(unit => createPerformance(unit, { ...s, shape: 'drop-in', startsAt: at('2031-08-01T09:00:00Z'), endsAt: at('2031-08-01T16:00:00Z'), doorsAt: at('2031-08-01T08:30:00Z'), intervalCount: 2 }))
    expect((await rows('SELECT shape, doors_at, interval_count, starts_at, ends_at FROM core_performances WHERE id = ?', id))[0]).toEqual({ shape: 'drop-in', doors_at: null, interval_count: 0, starts_at: at('2031-08-01T09:00:00Z'), ends_at: at('2031-08-01T16:00:00Z') })
  })

  it('stays within one operating day, which runs to 04:00', async () => {
    const s = await setting()
    // Late opening to 03:00 the next morning (British Summer Time) is still the same show night.
    await expect(inUnit(unit => createPerformance(unit, { ...s, shape: 'drop-in', startsAt: at('2031-08-02T09:00:00Z'), endsAt: at('2031-08-03T02:00:00Z') }))).resolves.toBeTruthy()
    await expect(inUnit(unit => createPerformance(unit, { ...s, shape: 'drop-in', startsAt: at('2031-08-04T09:00:00Z'), endsAt: at('2031-08-05T04:00:00Z') }))).rejects.toMatchObject({ code: 'core.performance.drop-in-one-day' })
  })

  it('is guarded like any performance for its whole hours (DI3)', async () => {
    const s = await setting()
    const { gallery, talk } = await inUnit(async unit => ({
      gallery: await createPerformance(unit, { ...s, shape: 'drop-in', startsAt: at('2031-08-06T09:00:00Z'), endsAt: at('2031-08-06T16:00:00Z') }),
      talk: await createPerformance(unit, { ...s, startsAt: at('2031-08-06T13:00:00Z'), endsAt: at('2031-08-06T14:00:00Z') }),
    }))
    expect(await inUnit(unit => schedulePerformances(unit, [gallery, talk]))).toEqual({ scheduled: [gallery], refused: [{ id: talk, reason: 'space-taken' }] })
  })

  it('changes between timed and drop-in only while a draft (DI1)', async () => {
    const s = await setting()
    const id = await inUnit(unit => createPerformance(unit, { ...s, startsAt: at('2031-08-07T18:00:00Z'), endsAt: at('2031-08-07T20:00:00Z') }))
    const turned = await req('PATCH', `/api/core/performances/${id}`, { shape: 'drop-in', startsAt: at('2031-08-07T09:00:00Z'), endsAt: at('2031-08-07T17:00:00Z') })
    expect(turned.status, JSON.stringify(turned.body)).toBe(200)
    expect((await rows('SELECT shape, doors_at FROM core_performances WHERE id = ?', id))[0]).toEqual({ shape: 'drop-in', doors_at: null })
    await inUnit(unit => schedulePerformances(unit, [id]))
    const back = await req('PATCH', `/api/core/performances/${id}`, { shape: 'timed' })
    expect(back.body.code).toBe('core.performance.shape-fixed')
  })
})
