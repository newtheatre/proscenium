// Part 3's performance moves, C-03 to C-07, C-10 and C-12: a performance is added as a draft,
// scheduled only into a free space that is not closed, cancelled with a reason, reinstated while it
// has not started, and completed once by the task. Each change on a scheduled performance is
// announced with the old and new values, and venues and spaces in use cannot be archived or deleted.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import deleteProduction from '../../server/api/core/productions/[id]/index.delete'
import getProduction from '../../server/api/core/productions/[id]/index.get'
import listPerformances from '../../server/api/core/productions/[id]/performances/index.get'
import addPerformance from '../../server/api/core/productions/[id]/performances/index.post'
import getPerformance from '../../server/api/core/performances/[id]/index.get'
import patchPerformance from '../../server/api/core/performances/[id]/index.patch'
import deletePerformance from '../../server/api/core/performances/[id]/index.delete'
import schedule from '../../server/api/core/performances/[id]/schedule.post'
import cancel from '../../server/api/core/performances/[id]/cancel.post'
import reinstate from '../../server/api/core/performances/[id]/reinstate.post'
import setAccess from '../../server/api/core/performances/[id]/access.put'
import setEffectsOff from '../../server/api/core/performances/[id]/effects.put'
import setEffects from '../../server/api/core/productions/[id]/effects.put'
import impact from '../../server/api/core/performances/[id]/impact.get'
import createVenue from '../../server/api/core/venues/index.post'
import addSpace from '../../server/api/core/venues/[id]/spaces/index.post'
import getVenue from '../../server/api/core/venues/[id]/index.get'
import archiveVenue from '../../server/api/core/venues/[id]/archive.post'
import archiveSpace from '../../server/api/core/venues/[id]/spaces/[space]/archive.post'
import deleteSpace from '../../server/api/core/venues/[id]/spaces/[space]/index.delete'
import createClosure from '../../server/api/core/closures/index.post'
import patchProduction from '../../server/api/core/productions/[id]/index.patch'
import publishProduction from '../../server/api/core/productions/[id]/publish.post'
import cancelProduction from '../../server/api/core/productions/[id]/cancel.post'
import restoreProduction from '../../server/api/core/productions/[id]/restore.post'
import productionImpact from '../../server/api/core/productions/[id]/impact.get'
import { guidanceFor } from '../../server/programme/guidance'
import { completeEnded } from '../../server/programme/performances'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

// Nothing in these tests sells tickets, so a production needs a booking link to publish (Matt, 2026-11-17).
const BOOKING = 'https://tickets.example/book'

const handle = server({
  'POST /api/core/productions': createProduction,
  'GET /api/core/productions/:id': getProduction,
  'DELETE /api/core/productions/:id': deleteProduction,
  'GET /api/core/productions/:id/performances': listPerformances,
  'POST /api/core/productions/:id/performances': addPerformance,
  'GET /api/core/performances/:id': getPerformance,
  'PATCH /api/core/performances/:id': patchPerformance,
  'DELETE /api/core/performances/:id': deletePerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/performances/:id/cancel': cancel,
  'POST /api/core/performances/:id/reinstate': reinstate,
  'PUT /api/core/performances/:id/access': setAccess,
  'PUT /api/core/performances/:id/effects': setEffectsOff,
  'PUT /api/core/productions/:id/effects': setEffects,
  'GET /api/core/performances/:id/impact': impact,
  'POST /api/core/venues': createVenue,
  'POST /api/core/venues/:id/spaces': addSpace,
  'GET /api/core/venues/:id': getVenue,
  'POST /api/core/venues/:id/archive': archiveVenue,
  'POST /api/core/venues/:id/spaces/:space/archive': archiveSpace,
  'DELETE /api/core/venues/:id/spaces/:space': deleteSpace,
  'POST /api/core/closures': createClosure,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/cancel': cancelProduction,
  'POST /api/core/productions/:id/restore': restoreProduction,
  'GET /api/core/productions/:id/impact': productionImpact,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.production.cancel', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage', 'core.closure.manage'])
const scheduler = person(['core.performance.schedule'])
const viewer = person(['core.production.view'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object, actor = admin) => json(call(handle, method, path, { actor, body }))
const at = (iso: string) => Date.parse(iso)
const term = async (vocabulary: string, slug: string) =>
  (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const events = (name: string, id: string) => rows<{ payload: string }>('SELECT payload FROM core_events WHERE name = ? AND record_id = ? ORDER BY rowid', name, id)

let n = 0
async function stage(): Promise<{ productionId: string, venueId: string, main: string, studio: string }> {
  const production = await req('POST', '/api/core/productions', { title: `Performed ${++n}`, kind: 'own' })
  expect(production.status).toBe(200)
  const venue = await req('POST', '/api/core/venues', { name: `Performance venue ${n}` })
  const studio = await req('POST', `/api/core/venues/${venue.body.venueId}/spaces`, { name: 'Studio', kindTermId: await term('core.space-kind', 'studio') })
  return { productionId: production.body.id, venueId: venue.body.venueId, main: venue.body.spaceId, studio: studio.body.id }
}
async function add(s: { productionId: string, venueId: string, main: string }, startsAt: string, extra: object = {}): Promise<string> {
  const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.main, startsAt: at(startsAt), ...extra })
  expect(status, JSON.stringify(body)).toBe(200)
  return body.id
}
const state = async (id: string) => (await rows<{ state: string }>('SELECT state FROM core_performances WHERE id = ?', id))[0]?.state

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

describe('staging effects not used at a performance (C-55)', () => {
  it('are limited to the production\'s effects, shown as not used, and dropped when the production stops using them', async () => {
    await inContext(async () => (await import('../../server/vocabularies/service')).ensureVocabularies())
    const s = await stage()
    const haze = await term('core.staging-effect', 'haze')
    const strobe = await term('core.staging-effect', 'strobe')
    const id = await add(s, '2027-04-01T19:30:00Z')
    const other = await add(s, '2027-04-02T19:30:00Z')
    expect((await req('PUT', `/api/core/productions/${s.productionId}/effects`, { effects: [{ termId: haze }, { termId: strobe }] })).status).toBe(200)
    expect((await req('PUT', `/api/core/performances/${id}/effects`, { termIds: [await term('core.cancel-reason', 'illness')] })).body.code).toBe('core.performance.effects-unknown')
    expect((await req('PUT', `/api/core/performances/${id}/effects`, { termIds: [haze, haze] })).body.code).toBe('core.performance.effects-repeated')
    expect((await req('PUT', `/api/core/performances/${id}/effects`, { termIds: [haze] })).status).toBe(200)
    expect((await req('GET', `/api/core/performances/${id}`)).body.effectsOff).toEqual([haze])
    const here = await inContext(() => guidanceFor(s.productionId, id))
    expect(here!.effects.map(e => e.termId)).toEqual([strobe])
    expect(here!.notAtThisPerformance).toEqual(['Haze or smoke'])
    expect((await inContext(() => guidanceFor(s.productionId, other)))!.effects).toHaveLength(2)
    expect((await inContext(() => guidanceFor(s.productionId)))!.effects).toHaveLength(2)
    await req('PUT', `/api/core/productions/${s.productionId}/effects`, { effects: [{ termId: strobe }] })
    expect((await req('GET', `/api/core/performances/${id}`)).body.effectsOff).toEqual([])
  })
})

describe('performances', () => {
  it('need the ability on the production, and can be seen with view', async () => {
    const s = await stage()
    expect((await call(handle, 'POST', `/api/core/productions/${s.productionId}/performances`, { actor: viewer, body: { venueId: s.venueId, spaceId: s.main, startsAt: at('2027-03-01T19:30:00Z') } })).status).toBe(403)
    const id = await add(s, '2027-03-01T19:30:00Z')
    expect((await call(handle, 'POST', `/api/core/performances/${id}/cancel`, { actor: scheduler, body: { reasonTermId: 'x' } })).status).toBe(403)
    expect((await req('GET', `/api/core/performances/${id}`, undefined, viewer)).status).toBe(200)
    expect((await req('GET', `/api/core/productions/${s.productionId}/performances`, undefined, viewer)).body.performances).toHaveLength(1)
  })

  it('start as drafts, with doors and the end from the settings, on the theatre\'s operating day', async () => {
    const s = await stage()
    const id = await add(s, '2027-03-02T19:30:00Z')
    const { body } = await req('GET', `/api/core/performances/${id}`)
    expect(body).toMatchObject({ state: 'draft', startsAt: at('2027-03-02T19:30:00Z'), doorsAt: at('2027-03-02T19:00:00Z'), endsAt: at('2027-03-02T21:30:00Z'), operatingDay: '2027-03-02' })
    // Half past midnight belongs to the day before, which starts at 04:00.
    const late = await add(s, '2027-03-03T00:30:00Z', { endsAt: at('2027-03-03T01:30:00Z'), doorsAt: null })
    expect((await req('GET', `/api/core/performances/${late}`)).body).toMatchObject({ operatingDay: '2027-03-02', doorsAt: null })
    expect((await req('POST', `/api/core/productions/${s.productionId}/performances`, { venueId: s.venueId, spaceId: s.main, startsAt: at('2027-03-04T19:30:00Z'), endsAt: at('2027-03-04T19:00:00Z') })).body.code).toBe('core.performance.times')
  })

  it('carry whether the theatre runs their space (R-36)', async () => {
    const s = await stage()
    const visiting = await req('POST', `/api/core/venues/${s.venueId}/spaces`, { name: 'Hired hall', kindTermId: await term('core.space-kind', 'studio'), managed: false })
    const ours = await add(s, '2027-03-06T19:30:00Z')
    const theirs = await add(s, '2027-03-07T19:30:00Z', { spaceId: visiting.body.id })
    expect((await req('GET', `/api/core/performances/${ours}`)).body.spaceManaged).toBe(true)
    expect((await req('GET', `/api/core/performances/${theirs}`)).body.spaceManaged).toBe(false)
    const items: { id: string, spaceManaged: boolean }[] = (await req('GET', `/api/core/productions/${s.productionId}/performances`)).body.performances
    expect(Object.fromEntries(items.map(p => [p.id, p.spaceManaged]))).toEqual({ [ours]: true, [theirs]: false })
  })

  it('refuse a space from another venue', async () => {
    const a = await stage()
    const b = await stage()
    const { status, body } = await req('POST', `/api/core/productions/${a.productionId}/performances`, { venueId: a.venueId, spaceId: b.main, startsAt: at('2027-03-05T19:30:00Z') })
    expect(status).toBe(409)
    expect(body.code).toBe('core.performance.space-unsuitable')
  })

  it('are scheduled into a free space only, and keep the production\'s dates', async () => {
    const s = await stage()
    const first = await add(s, '2027-04-01T19:30:00Z')
    const clash = await add(s, '2027-04-01T20:00:00Z')
    const studio = await add(s, '2027-04-01T20:00:00Z', { spaceId: s.studio })
    expect((await req('POST', `/api/core/performances/${first}/schedule`, {})).status).toBe(200)
    const refused = await req('POST', `/api/core/performances/${clash}/schedule`, {})
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.performance.clash')
    expect((await req('POST', `/api/core/performances/${studio}/schedule`, {})).status).toBe(200)
    expect(await events('core.performance.scheduled', first)).toHaveLength(1)
    const [production] = await rows<{ first_starts_at: number, last_ends_at: number }>('SELECT first_starts_at, last_ends_at FROM core_productions WHERE id = ?', s.productionId)
    expect(production).toEqual({ first_starts_at: at('2027-04-01T19:30:00Z'), last_ends_at: at('2027-04-01T22:00:00Z') })
  })

  it('are not scheduled into a closed space, and warn of a closure that does not block', async () => {
    const s = await stage()
    await req('POST', '/api/core/closures', { venueId: s.venueId, title: 'Rewiring', allDay: true, from: '2027-05-01', to: '2027-05-01' })
    await req('POST', '/api/core/closures', { title: 'Bank holiday', allDay: true, from: '2027-05-03', to: '2027-05-03', blocksPerformances: false })
    const closed = await add(s, '2027-05-01T19:30:00Z')
    expect((await req('POST', `/api/core/performances/${closed}/schedule`, {})).body.code).toBe('core.performance.closed')
    const holiday = await add(s, '2027-05-03T19:30:00Z')
    expect((await req('POST', `/api/core/performances/${holiday}/schedule`, {})).body.warnings).toEqual(['Bank holiday'])
  })

  it('are cancelled with a reason, and reinstated while the space is still free', async () => {
    const s = await stage()
    const id = await add(s, '2027-06-01T19:30:00Z')
    await req('POST', `/api/core/performances/${id}/schedule`, {})
    expect((await req('POST', `/api/core/performances/${id}/cancel`, { reasonTermId: await term('core.space-kind', 'studio') })).body.code).toBe('core.performance.reason-unknown')
    const illness = await term('core.cancel-reason', 'illness')
    expect((await req('POST', `/api/core/performances/${id}/cancel`, { reasonTermId: illness, note: 'The lead is unwell.' })).status).toBe(200)
    expect(await state(id)).toBe('cancelled')
    expect((await events('core.performance.cancelled', id)).map(e => JSON.parse(e.payload).reason)).toEqual(['illness'])
    expect((await rows<{ last_ends_at: number | null }>('SELECT last_ends_at FROM core_productions WHERE id = ?', s.productionId))[0]!.last_ends_at).toBeNull()
    expect((await req('PATCH', `/api/core/performances/${id}`, { capacity: 50 })).body.code).toBe('core.performance.cancelled')

    // Another performance takes the slot, so it cannot come back until that one moves.
    const other = await add(s, '2027-06-01T19:30:00Z')
    await req('POST', `/api/core/performances/${other}/schedule`, {})
    expect((await req('POST', `/api/core/performances/${id}/reinstate`, {})).body.code).toBe('core.performance.clash')
    await req('PATCH', `/api/core/performances/${other}`, { spaceId: s.studio })
    expect((await req('POST', `/api/core/performances/${id}/reinstate`, {})).status).toBe(200)
    expect((await events('core.performance.scheduled', id)).map(e => JSON.parse(e.payload).reinstated)).toEqual([false, true])
    expect((await rows('SELECT cancel_reason_term_id, cancel_note FROM core_performances WHERE id = ?', id))[0]).toEqual({ cancel_reason_term_id: null, cancel_note: null })
  })

  it('announce each kind of change on a scheduled performance, and none on a draft', async () => {
    const s = await stage()
    const draft = await add(s, '2027-07-01T19:30:00Z')
    await req('PATCH', `/api/core/performances/${draft}`, { startsAt: at('2027-07-01T19:00:00Z'), capacity: 80 })
    expect(await rows('SELECT name FROM core_events WHERE record_id = ?', draft)).toEqual([])

    const id = await add(s, '2027-07-02T19:30:00Z')
    await req('POST', `/api/core/performances/${id}/schedule`, {})
    const moved = await req('PATCH', `/api/core/performances/${id}`, { startsAt: at('2027-07-02T19:00:00Z'), endsAt: at('2027-07-02T21:00:00Z') })
    expect(moved.status).toBe(200)
    expect((await req('GET', `/api/core/performances/${id}`)).body.doorsAt).toBe(at('2027-07-02T18:30:00Z'))
    expect(JSON.parse((await events('core.performance.rescheduled', id))[0]!.payload)).toMatchObject({ oldStartsAt: at('2027-07-02T19:30:00Z'), startsAt: at('2027-07-02T19:00:00Z'), endsAt: at('2027-07-02T21:00:00Z') })
    await req('PATCH', `/api/core/performances/${id}`, { spaceId: s.studio })
    expect(JSON.parse((await events('core.performance.moved', id))[0]!.payload)).toMatchObject({ oldSpaceId: s.main, spaceId: s.studio })
    await req('PATCH', `/api/core/performances/${id}`, { capacity: 120 })
    expect(JSON.parse((await events('core.performance.capacity-changed', id))[0]!.payload)).toMatchObject({ oldCapacity: null, capacity: 120 })
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.performance.rescheduled', id)).toHaveLength(1)
  })

  it('show what a change would touch, and no refusal while no module guards it', async () => {
    const s = await stage()
    const id = await add(s, '2027-07-03T19:30:00Z')
    expect((await req('GET', `/api/core/performances/${id}/impact?kind=cancel`, undefined, viewer)).body).toEqual({ lines: [], refusal: null })
    expect((await req('GET', `/api/core/performances/${id}/impact?kind=nonsense`, undefined, viewer)).status).toBe(422)
  })

  it('take access features from the vocabulary, once each', async () => {
    const s = await stage()
    const id = await add(s, '2027-07-04T19:30:00Z')
    const captioned = await term('core.access-feature', 'captioned')
    const relaxed = await term('core.access-feature', 'relaxed')
    expect((await req('PUT', `/api/core/performances/${id}/access`, { features: [{ termId: captioned, detail: 'Stagetext' }, { termId: relaxed }] })).status).toBe(200)
    expect((await req('GET', `/api/core/performances/${id}`)).body.access).toHaveLength(2)
    expect((await req('PUT', `/api/core/performances/${id}/access`, { features: [{ termId: captioned }, { termId: captioned }] })).body.code).toBe('core.performance.access-repeated')
    expect((await req('PUT', `/api/core/performances/${id}/access`, { features: [{ termId: await term('core.cancel-reason', 'illness') }] })).body.code).toBe('core.performance.access-unknown')
    expect((await req('GET', `/api/core/performances/${id}`)).body.access).toHaveLength(2)
  })

  it('are deleted only as drafts, and go with a draft production', async () => {
    const s = await stage()
    const draft = await add(s, '2027-08-01T19:30:00Z')
    const scheduled = await add(s, '2027-08-02T19:30:00Z')
    await req('POST', `/api/core/performances/${scheduled}/schedule`, {})
    expect((await req('DELETE', `/api/core/performances/${scheduled}`, {})).body.code).toBe('core.performance.not-deletable')
    expect((await req('DELETE', `/api/core/performances/${draft}`, {})).status).toBe(200)
    expect(await state(draft)).toBeUndefined()

    const t = await stage()
    const only = await add(t, '2027-08-03T19:30:00Z')
    expect((await req('DELETE', `/api/core/productions/${t.productionId}`, {})).status).toBe(200)
    expect(await state(only)).toBeUndefined()
    expect((await req('DELETE', `/api/core/productions/${s.productionId}`, {})).status).not.toBe(200)
  })

  it('keep a venue and space from being archived while performances are to come, and a space that was used from deletion', async () => {
    const s = await stage()
    const id = await add(s, '2027-09-01T19:30:00Z', { spaceId: s.studio })
    expect((await req('DELETE', `/api/core/venues/${s.venueId}/spaces/${s.studio}`, {})).body.code).toBe('core.space.performed')
    await req('POST', `/api/core/performances/${id}/schedule`, {})
    expect((await req('POST', `/api/core/venues/${s.venueId}/spaces/${s.studio}/archive`, {})).body.code).toBe('core.place.in-use')
    expect((await req('POST', `/api/core/venues/${s.venueId}/archive`, {})).body.code).toBe('core.place.in-use')
    // The venue's page lists what is keeping it from being archived.
    const page = (await req('GET', `/api/core/venues/${s.venueId}`)).body as { upcoming: { id: string }[], theatreCountry: string }
    expect(page.upcoming.map(p => p.id)).toEqual([id])
    expect(page.theatreCountry).toMatch(/^[A-Z]{2}$/)
    await req('POST', `/api/core/performances/${id}/cancel`, { reasonTermId: await term('core.cancel-reason', 'other') })
    expect((await req('POST', `/api/core/venues/${s.venueId}/spaces/${s.studio}/archive`, {})).status).toBe(200)
  })

  it('are completed once they end, each announced once', async () => {
    const s = await stage()
    const id = await add(s, '2027-10-01T19:30:00Z')
    await req('POST', `/api/core/performances/${id}/schedule`, {})
    await env.DB.prepare('UPDATE core_performances SET starts_at = ?, doors_at = NULL, ends_at = ? WHERE id = ?').bind(Date.now() - 7_200_000, Date.now() - 60_000, id).run()
    const run = () => inContext(async () => {
      const unit = createUnit()
      const done = await completeEnded(unit)
      await unit.commit()
      return done
    })
    expect(await run()).toBeGreaterThanOrEqual(1)
    expect(await run()).toBe(0)
    expect(await state(id)).toBe('completed')
    expect(await events('core.performance.completed', id)).toHaveLength(1)
    expect((await req('PATCH', `/api/core/performances/${id}`, { capacity: 10 })).body.code).toBe('core.performance.completed')
  })

  it('go with their production when it is cancelled: scheduled ones still to come only, with the same reason', async () => {
    const s = await stage()
    await req('PATCH', `/api/core/productions/${s.productionId}`, { summary: 'A run to cancel.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING })
    expect((await req('POST', `/api/core/productions/${s.productionId}/cancel`, { reasonTermId: await term('core.cancel-reason', 'other') })).body.code).toBe('core.production.not-cancellable')
    await req('POST', `/api/core/productions/${s.productionId}/publish`, {})

    const future: string[] = []
    for (let day = 1; day <= 12; day++) {
      const id = await add(s, `2027-11-${String(day).padStart(2, '0')}T19:30:00Z`)
      await req('POST', `/api/core/performances/${id}/schedule`, {})
      future.push(id)
    }
    const drafts = [await add(s, '2027-12-01T19:30:00Z'), await add(s, '2027-12-02T19:30:00Z')]
    const done: string[] = []
    for (let day = 3; day <= 5; day++) {
      const id = await add(s, `2027-12-0${day}T19:30:00Z`)
      await req('POST', `/api/core/performances/${id}/schedule`, {})
      done.push(id)
    }
    await env.DB.prepare(`UPDATE core_performances SET state = 'completed', completed_at = ? WHERE id IN (${done.map(() => '?').join(', ')})`).bind(Date.now(), ...done).run()

    expect((await req('GET', `/api/core/productions/${s.productionId}/impact?kind=cancel`, undefined, viewer)).body)
      .toEqual({ lines: ['12 scheduled performances still to come will be cancelled with the same reason.'], refusal: null })
    expect((await req('POST', `/api/core/productions/${s.productionId}/cancel`, { reasonTermId: await term('core.cancel-reason', 'illness') }, person(['core.performance.cancel']))).status).toBe(403)
    const { status, body } = await req('POST', `/api/core/productions/${s.productionId}/cancel`, { reasonTermId: await term('core.cancel-reason', 'weather'), note: 'Snow.' })
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.performances).toBe(12)

    const states = await rows<{ id: string, state: string, cancel_note: string | null }>('SELECT id, state, cancel_note FROM core_performances WHERE production_id = ?', s.productionId)
    expect(states.filter(r => future.includes(r.id)).every(r => r.state === 'cancelled' && r.cancel_note === 'Snow.')).toBe(true)
    expect(states.filter(r => drafts.includes(r.id)).map(r => r.state)).toEqual(['draft', 'draft'])
    expect(states.filter(r => done.includes(r.id)).map(r => r.state)).toEqual(['completed', 'completed', 'completed'])
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.cancelled' AND payload LIKE ?", `%${s.productionId}%`)).toHaveLength(12)
    expect((await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'core.production.cancelled' AND record_id = ?", s.productionId)).map(e => JSON.parse(e.payload))).toEqual([{ productionId: s.productionId, reason: 'weather' }])
    expect((await rows('SELECT state FROM core_productions WHERE id = ?', s.productionId))[0]).toEqual({ state: 'cancelled' })

    // Brought back, it is withdrawn and its performances stay cancelled, to be reinstated one by one.
    expect((await req('POST', `/api/core/productions/${s.productionId}/restore`, {})).status).toBe(200)
    expect((await rows('SELECT state, cancel_reason_term_id FROM core_productions WHERE id = ?', s.productionId))[0]).toEqual({ state: 'withdrawn', cancel_reason_term_id: null })
    expect(await rows("SELECT id FROM core_performances WHERE production_id = ? AND state = 'cancelled'", s.productionId)).toHaveLength(12)
  })
})
