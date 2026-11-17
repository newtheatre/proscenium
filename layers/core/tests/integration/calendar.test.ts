// C-13: the programme calendar shows performances and closures for a run of operating days, for a
// venue, a space or everything, in the theatre's time zone. A performance at 00:30 sits with the
// evening before, and an all-day closure covers whole operating days.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import addPerformance from '../../server/api/core/productions/[id]/performances/index.post'
import createVenue from '../../server/api/core/venues/index.post'
import addSpace from '../../server/api/core/venues/[id]/spaces/index.post'
import createClosure from '../../server/api/core/closures/index.post'
import calendar from '../../server/api/core/calendar.get'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/core/venues/:id/spaces': addSpace,
  'POST /api/core/closures': createClosure,
  'GET /api/core/calendar': calendar,
})
const admin = person(['core.production.create', 'core.performance.schedule', 'core.venue.manage', 'core.closure.manage', 'core.production.view'])
const viewer = person(['core.production.view'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object, actor = admin) => json(call(handle, method, path, { actor, body }))
const at = (iso: string) => Date.parse(iso)

let n = 0
async function stage() {
  const production = await req('POST', '/api/core/productions', { title: `On the calendar ${++n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Calendar venue ${n}` })
  const kind = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND slug = 'studio'"))[0]!.id
  const studio = await req('POST', `/api/core/venues/${venue.body.venueId}/spaces`, { name: 'Studio', kindTermId: kind })
  return { productionId: production.body.id as string, venueId: venue.body.venueId as string, main: venue.body.spaceId as string, studio: studio.body.id as string }
}
async function add(s: { productionId: string, venueId: string }, spaceId: string, startsAt: string, endsAt?: string) {
  const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId, startsAt: at(startsAt), ...(endsAt ? { endsAt: at(endsAt) } : {}) })
  expect(status, JSON.stringify(body)).toBe(200)
  return body.id as string
}
const view = (query: string, actor = viewer) => json(call(handle, 'GET', `/api/core/calendar?${query}`, { actor }))

beforeEach(async () => {
  resetRateLimits()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
})
afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM core_closures'),
    env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.locale.time-zone'"),
  ])
})

describe('the programme calendar', () => {
  it('needs the view ability and a window of one to 42 days', async () => {
    expect((await view('from=2027-05-01&to=2027-05-31', person([]))).status).toBe(403)
    expect((await view('from=2027-05-02&to=2027-05-01')).body.code).toBe('core.calendar.window')
    expect((await view('from=2027-05-01&to=2027-06-12')).body.code).toBe('core.calendar.window')
    expect((await view('from=2027-05-01&to=2027-06-11')).status).toBe(200)
  })

  it('places a show after midnight on the evening before, and closures on the days they cover', async () => {
    const s = await stage()
    const evening = await add(s, s.main, '2027-05-14T18:30:00Z')
    const late = await add(s, s.main, '2027-05-14T23:30:00Z', '2027-05-15T00:30:00Z') // 00:30 on the 15th, London time
    await req('POST', '/api/core/closures', { venueId: s.venueId, title: 'Bank holiday', allDay: true, from: '2027-05-31', to: '2027-05-31' })
    const { status, body } = await view(`from=2027-05-01&to=2027-05-31&venueId=${s.venueId}`)
    expect(status).toBe(200)
    expect(body.performances.map((p: { id: string, operatingDay: string }) => [p.id, p.operatingDay])).toEqual([[evening, '2027-05-14'], [late, '2027-05-14']])
    expect(body.performances[0]).toMatchObject({ productionId: s.productionId, productionTitle: `On the calendar ${n}`, spaceId: s.main, state: 'draft' })
    expect(body.closures).toMatchObject([{ title: 'Bank holiday', allDay: true, firstDay: '2027-05-31', lastDay: '2027-05-31' }])
    expect(body.places.find((p: { id: string }) => p.id === s.venueId).spaces.map((sp: { name: string }) => sp.name).sort()).toEqual([`Calendar venue ${n}`, 'Studio'])
  })

  it('narrows to one space, keeping closures of its venue and of the whole theatre', async () => {
    const s = await stage()
    await add(s, s.main, '2027-06-04T18:30:00Z')
    const inStudio = await add(s, s.studio, '2027-06-05T18:30:00Z')
    await req('POST', '/api/core/closures', { title: 'Whole theatre', allDay: true, from: '2027-06-10', to: '2027-06-11' })
    await req('POST', '/api/core/closures', { venueId: s.venueId, spaceId: s.main, title: 'Main house only', allDay: true, from: '2027-06-12', to: '2027-06-12' })
    const { body } = await view(`from=2027-06-01&to=2027-06-30&spaceId=${s.studio}`)
    expect(body.performances.map((p: { id: string }) => p.id)).toEqual([inStudio])
    expect(body.closures.map((c: { title: string, firstDay: string, lastDay: string }) => [c.title, c.firstDay, c.lastDay])).toEqual([['Whole theatre', '2027-06-10', '2027-06-11']])
  })
})
