// C-68: core's write services for other modules. Each adds to the caller's unit and never commits;
// schedulePerformances reports what it refused, catching two drafts that clash with each other.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createVenue from '../../server/api/core/venues/index.post'
import addSpace from '../../server/api/core/venues/[id]/spaces/index.post'
import createClosure from '../../server/api/core/closures/index.post'
import { addCredit, createPerformance, createProduction, listCredits, movePerformance, removeCredit, schedulePerformances, setProductionCompanyName, updateCredit } from '../../server/services'
import { changeSetting, createUnit, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({ 'POST /api/core/venues': createVenue, 'POST /api/core/venues/:id/spaces': addSpace, 'POST /api/core/closures': createClosure })
const admin = person(['core.venue.manage', 'core.closure.manage'])
const req = async (method: string, path: string, body?: object) => {
  const r = await call(handle, method, path, { actor: admin, body })
  return { status: r.status, body: await r.json() as any }
}
const term = async (vocabulary: string, slug: string) => (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const at = (iso: string) => Date.parse(iso)
const hours = (n: number) => n * 3_600_000
const inUnit = <T>(fn: (unit: UnitView) => Promise<T>) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit)
  await unit.commit()
  return out
}, admin)
const state = async (id: string) => (await rows<{ state: string }>('SELECT state FROM core_performances WHERE id = ?', id))[0]?.state

let n = 0
async function venue(): Promise<{ venueId: string, main: string, studio: string }> {
  const v = await req('POST', '/api/core/venues', { name: `Writes venue ${++n}` })
  const studio = await req('POST', `/api/core/venues/${v.body.venueId}/spaces`, { name: 'Studio', kindTermId: await term('core.space-kind', 'studio') })
  return { venueId: v.body.venueId, main: v.body.spaceId, studio: studio.body.id }
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
  await env.DB.batch([env.DB.prepare('DELETE FROM core_closures'), env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.locale.time-zone'")])
})

describe('createProduction and createPerformance', () => {
  it('make a draft production with its credits and a draft performance in one unit, committing nothing themselves', async () => {
    const v = await venue()
    const section = await term('core.credit-section', 'creative-team')
    let productionId = ''
    const uncommitted = await inContext(async () => {
      const unit = createUnit()
      productionId = await createProduction(unit, { title: 'Made elsewhere', kind: 'visiting', companyName: 'Fringe Co', runningMinutes: 75, credits: [{ creditedName: 'Ada Lovelace', role: 'Director', sectionTermId: section }] })
      await createPerformance(unit, { productionId, spaceId: v.main, startsAt: at('2031-05-01T19:30:00Z'), made: { runningMinutes: 75 } })
      return rows('SELECT id FROM core_productions WHERE id = ?', productionId)
    }, admin)
    expect(uncommitted).toHaveLength(0)

    const ids = await inUnit(async (unit) => {
      const id = await createProduction(unit, { title: 'Made elsewhere', kind: 'visiting', runningMinutes: 75, credits: [{ creditedName: 'Ada Lovelace', role: 'Director', sectionTermId: section }] })
      const performanceId = await createPerformance(unit, { productionId: id, spaceId: v.main, startsAt: at('2031-05-01T19:30:00Z'), made: { runningMinutes: 75 } })
      return { id, performanceId }
    })
    expect((await rows('SELECT state, kind FROM core_productions WHERE id = ?', ids.id))[0]).toEqual({ state: 'draft', kind: 'visiting' })
    expect((await rows('SELECT state, venue_id, ends_at - starts_at AS length FROM core_performances WHERE id = ?', ids.performanceId))[0]).toEqual({ state: 'draft', venue_id: v.venueId, length: 75 * 60_000 })
    expect((await inContext(() => listCredits(ids.id))).map(c => c.creditedName)).toEqual(['Ada Lovelace'])
  })

  it('refuse a performance in a space that cannot hold one, on the statement', async () => {
    const v = await venue()
    await env.DB.prepare('UPDATE core_spaces SET performable = 0 WHERE id = ?').bind(v.studio).run()
    const refused = inUnit(async (unit) => {
      const id = await createProduction(unit, { title: 'Nowhere to go', kind: 'own' })
      await createPerformance(unit, { productionId: id, spaceId: v.studio, startsAt: at('2031-05-02T19:30:00Z'), made: {} })
    })
    await expect(refused).rejects.toMatchObject({ code: 'core.performance.not-placed' })
    expect(await rows("SELECT id FROM core_productions WHERE title = 'Nowhere to go'")).toHaveLength(0)
  })
})

describe('schedulePerformances', () => {
  it('schedules the free drafts and reports the rest, with two drafts that clash with each other caught', async () => {
    const v = await venue()
    const { productionId, a, b, c, d, closed } = await inUnit(async (unit) => {
      const productionId = await createProduction(unit, { title: 'A plan', kind: 'own' })
      const made = { productionId, made: {} }
      const make = async (startsAt: string, spaceId = v.main) => createPerformance(unit, { ...made, spaceId, startsAt: at(startsAt), endsAt: at(startsAt) + hours(2) })
      return { productionId, a: await make('2031-06-01T19:00:00Z'), b: await make('2031-06-01T20:00:00Z'), c: await make('2031-06-01T20:00:00Z', v.studio), d: await make('2031-06-03T19:00:00Z'), closed: await make('2031-06-05T19:00:00Z') }
    })
    expect((await req('POST', '/api/core/closures', { title: 'Refurbishment', allDay: true, from: '2031-06-05', to: '2031-06-05', venueId: v.venueId, spaceId: v.main, blocksPerformances: true })).status).toBeLessThan(300)
    await env.DB.prepare("UPDATE core_performances SET state = 'scheduled' WHERE id = ?").bind(d).run()

    const outcome = await inUnit(unit => schedulePerformances(unit, [a, b, c, d, closed]))
    expect(outcome.scheduled).toEqual([a, c])
    expect(outcome.refused).toEqual([{ id: b, reason: 'space-taken' }, { id: d, reason: 'not-draft' }, { id: closed, reason: 'closed' }])
    expect(await state(a)).toBe('scheduled')
    expect(await state(b)).toBe('draft')
    expect(await state(c)).toBe('scheduled')
    expect(await rows("SELECT record_id FROM core_events WHERE name = 'core.performance.scheduled' AND record_id IN (?, ?) ORDER BY record_id", a, c)).toHaveLength(2)
    expect((await rows<{ first_starts_at: number }>('SELECT first_starts_at FROM core_productions WHERE id = ?', productionId))[0]!.first_starts_at).toBe(at('2031-06-01T19:00:00Z'))
  })

  it('refuses a draft that has already started', async () => {
    const v = await venue()
    const id = await inUnit(async (unit) => {
      const productionId = await createProduction(unit, { title: 'Too late', kind: 'own' })
      return createPerformance(unit, { productionId, made: {}, spaceId: v.main, startsAt: at('2020-01-01T19:00:00Z'), endsAt: at('2020-01-01T21:00:00Z') })
    })
    expect(await inUnit(unit => schedulePerformances(unit, [id]))).toEqual({ scheduled: [], refused: [{ id, reason: 'started' }] })
  })
})

describe('movePerformance and setProductionCompanyName', () => {
  it('moves a draft anywhere, and a scheduled one only into a free space, announcing the move', async () => {
    const v = await venue()
    const other = await venue()
    const { a, b } = await inUnit(async (unit) => {
      const productionId = await createProduction(unit, { title: 'On the move', kind: 'own' })
      const make = async (startsAt: string) => createPerformance(unit, { productionId, made: {}, spaceId: v.main, startsAt: at(startsAt), endsAt: at(startsAt) + hours(2) })
      return { a: await make('2031-07-01T19:00:00Z'), b: await make('2031-07-02T19:00:00Z') }
    })
    await inUnit(unit => movePerformance(unit, a, { spaceId: other.studio, startsAt: at('2031-07-01T18:00:00Z'), endsAt: at('2031-07-01T20:00:00Z') }))
    expect((await rows('SELECT venue_id, space_id FROM core_performances WHERE id = ?', a))[0]).toEqual({ venue_id: other.venueId, space_id: other.studio })
    await inUnit(unit => schedulePerformances(unit, [a, b]))
    await expect(inUnit(unit => movePerformance(unit, b, { spaceId: other.studio, startsAt: at('2031-07-01T18:30:00Z'), endsAt: at('2031-07-01T20:30:00Z') }))).rejects.toMatchObject({ code: 'core.performance.clash' })
    await inUnit(unit => movePerformance(unit, b, { spaceId: other.main, startsAt: at('2031-07-02T19:00:00Z'), endsAt: at('2031-07-02T21:00:00Z') }))
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.performance.moved' AND record_id = ?", b)).toHaveLength(1)
  })

  it('keeps the company name in step', async () => {
    const id = await inUnit(unit => createProduction(unit, { title: 'Visitors', kind: 'visiting', companyName: 'Old Name' }))
    await inUnit(unit => setProductionCompanyName(unit, id, 'New Name'))
    expect((await rows('SELECT company_name FROM core_productions WHERE id = ?', id))[0]).toEqual({ company_name: 'New Name' })
  })
})

describe('the credit services', () => {
  it('add, change and remove a credit by its id, and never set a linked person\'s visibility for them', async () => {
    const section = await term('core.credit-section', 'creative-team')
    const productionId = await inUnit(unit => createProduction(unit, { title: 'Credited', kind: 'own' }))
    const creditId = await inUnit(unit => addCredit(unit, { productionId, creditedName: 'Grace Hopper', role: 'Designer', sectionTermId: section, visibility: 'members' }))
    await inUnit(unit => updateCredit(unit, creditId, { role: 'Set designer', visibility: 'public' } as never))
    expect((await rows('SELECT role, visibility FROM core_production_credits WHERE id = ?', creditId))[0]).toEqual({ role: 'Set designer', visibility: 'members' })
    await inUnit(unit => removeCredit(unit, creditId))
    expect(await rows('SELECT id FROM core_production_credits WHERE id = ?', creditId)).toHaveLength(0)
  })
})
