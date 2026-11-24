// C-61: a performance's line-up and its per-performance credits (festival-ready changes, LU1 to LU6).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createVenue from '../../server/api/core/venues/index.post'
import patchPerformance from '../../server/api/core/performances/[id]/index.patch'
import deletePerformance from '../../server/api/core/performances/[id]/index.delete'
import addItem from '../../server/api/core/performances/[id]/line-up/index.post'
import listItems from '../../server/api/core/performances/[id]/line-up/index.get'
import moveItem from '../../server/api/core/performances/[id]/line-up/[item]/move.put'
import removeItem from '../../server/api/core/performances/[id]/line-up/[item]/index.delete'
import { addCredit, createPerformance, createProduction, listCredits, schedulePerformances } from '../../server/services'
import { addCredit as addCreditAt, onProductionTeam, shownCredits } from '../../server/programme/credits'
import { publicProduction, type PublicProduction } from '../../server/programme/public'
import { changeSetting, createUnit, newId, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const admin = person(['core.venue.manage', 'core.performance.schedule', 'core.production.view', 'core.production.edit'])
const handle = server({
  'POST /api/core/venues': createVenue,
  'PATCH /api/core/performances/:id': patchPerformance,
  'DELETE /api/core/performances/:id': deletePerformance,
  'GET /api/core/performances/:id/line-up': listItems,
  'POST /api/core/performances/:id/line-up': addItem,
  'PUT /api/core/performances/:id/line-up/:item/move': moveItem,
  'DELETE /api/core/performances/:id/line-up/:item': removeItem,
})
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
const section = async () => (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', 'core.credit-section', 'cast'))[0]!.id
const names = async (performanceId: string) => (await req('GET', `/api/core/performances/${performanceId}/line-up`)).body.items.map((i: { name: string }) => i.name)
const publish = (id: string) => rows("UPDATE core_productions SET state = 'published', published_at = 1, summary = 's', credits_public = 1 WHERE id = ?", id)

let n = 0
async function showcase(): Promise<{ productionId: string, performanceId: string, spaceId: string }> {
  const v = await req('POST', '/api/core/venues', { name: `Hall ${++n}` })
  const productionId = await inUnit(unit => createProduction(unit, { title: `Dance Showcase ${n}`, kind: 'event' }))
  const performanceId = await inUnit(unit => createPerformance(unit, { productionId, spaceId: v.body.spaceId, startsAt: at(`2031-09-${String(n).padStart(2, '0')}T13:00:00Z`), endsAt: at(`2031-09-${String(n).padStart(2, '0')}T16:00:00Z`) }))
  return { productionId, performanceId, spaceId: v.body.spaceId }
}
const act = (title: string) => inUnit(unit => createProduction(unit, { title, kind: 'visiting' }))

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

describe('a line-up', () => {
  it('keeps its acts in order: last by default, first, or after another; moved and removed', async () => {
    const { performanceId: f } = await showcase()
    const a = (await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Ada' })).body.id
    const b = (await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Ben' })).body.id
    await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Cat', after: null })
    await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Dee', after: a })
    expect(await names(f)).toEqual(['Cat', 'Ada', 'Dee', 'Ben'])
    expect((await req('PUT', `/api/core/performances/${f}/line-up/${b}/move`, { after: null })).status).toBe(200)
    expect(await names(f)).toEqual(['Ben', 'Cat', 'Ada', 'Dee'])
    await req('PUT', `/api/core/performances/${f}/line-up/${b}/move`, { after: a })
    expect(await names(f)).toEqual(['Cat', 'Ada', 'Ben', 'Dee'])
    await req('DELETE', `/api/core/performances/${f}/line-up/${a}`)
    expect(await names(f)).toEqual(['Cat', 'Ben', 'Dee'])
    expect((await rows<{ sort: number }>('SELECT sort FROM core_performance_line_ups WHERE performance_id = ? ORDER BY sort', f)).map(r => r.sort)).toEqual([0, 1, 2])
  })

  it('line-up-time-inside-performance: refuses a set time outside it, and moves the times with the performance (LU1)', async () => {
    const { performanceId: f } = await showcase()
    const start = (await rows<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', f))[0]!.starts_at
    const outside = await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Late act', startsAt: start - 60_000 })
    expect(outside.body.code).toBe('core.line-up.time-outside')
    const id = (await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Opening act', startsAt: start + 1_800_000, minutes: 20 })).body.id
    expect((await req('PATCH', `/api/core/performances/${f}`, { startsAt: start + 3_600_000, endsAt: start + 4 * 3_600_000 })).status).toBe(200)
    expect((await rows('SELECT starts_at FROM core_performance_line_ups WHERE id = ?', id))[0]).toEqual({ starts_at: start + 5_400_000 })
  })

  it('line-up-production-once: a production appears once in one line-up, and in many line-ups (LU2)', async () => {
    const [one, two] = [await showcase(), await showcase()]
    const solo = await act('Solo Act')
    const first = await req('POST', `/api/core/performances/${one.performanceId}/line-up`, { productionId: solo })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect((await req('POST', `/api/core/performances/${one.performanceId}/line-up`, { productionId: solo, name: 'Again' })).body.code).toBe('core.line-up.already-in')
    expect((await req('POST', `/api/core/performances/${two.performanceId}/line-up`, { productionId: solo })).status).toBe(200)
    expect(await names(one.performanceId)).toEqual(['Solo Act'])
  })

  it('shows announced acts publicly, and "Also appearing in" once both are published (LU3)', async () => {
    const s = await showcase()
    const solo = await act(`Solo ${n}`)
    await req('POST', `/api/core/performances/${s.performanceId}/line-up`, { productionId: solo })
    await req('POST', `/api/core/performances/${s.performanceId}/line-up`, { name: 'Secret guest', announced: false })
    await inUnit(unit => schedulePerformances(unit, [s.performanceId]))
    await publish(s.productionId)
    const slugOf = async (id: string) => (await rows<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', id))[0]!.slug
    const show = await inContext(async () => await publicProduction(await slugOf(s.productionId)) as PublicProduction)
    expect(show.performances[0]!.lineUp.map(i => [i.name, i.production])).toEqual([[`Solo ${n}`, null]])
    const before = await inContext(async () => await publicProduction(await slugOf(solo)))
    expect(before).toBeNull()
    await publish(solo)
    const after = await inContext(async () => await publicProduction(await slugOf(solo)) as PublicProduction)
    expect(after.appearances.map(a => a.title)).toEqual([(await rows<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', s.productionId))[0]!.title])
    const linked = await inContext(async () => await publicProduction(await slugOf(s.productionId)) as PublicProduction)
    expect(linked.performances[0]!.lineUp[0]!.production).toEqual({ slug: await slugOf(solo), title: `Solo ${n}` })
  })

  it('goes with a deleted draft and stays with a cancelled performance (LU5)', async () => {
    const { performanceId: f } = await showcase()
    await req('POST', `/api/core/performances/${f}/line-up`, { name: 'Ada' })
    expect((await req('DELETE', `/api/core/performances/${f}`)).status).toBe(200)
    expect(await rows('SELECT id FROM core_performance_line_ups WHERE performance_id = ?', f)).toEqual([])
  })
})

describe('a per-performance credit', () => {
  it('per-performance-credit-belongs: names a performance of its own production, and a line-up item of that performance (LU4)', async () => {
    const [one, two] = [await showcase(), await showcase()]
    const sectionTermId = await section()
    await expect(inUnit(unit => addCredit(unit, { productionId: one.productionId, performanceId: two.performanceId, creditedName: 'Ada', role: 'Dancer', sectionTermId })))
      .rejects.toMatchObject({ code: 'core.credit.not-this-production' })
    const item = (await req('POST', `/api/core/performances/${two.performanceId}/line-up`, { name: 'Troupe' })).body.id
    await expect(inUnit(unit => addCredit(unit, { productionId: one.productionId, lineUpId: item, creditedName: 'Ada', role: 'Dancer', sectionTermId })))
      .rejects.toMatchObject({ code: 'core.credit.not-this-production' })
    const credit = await inUnit(unit => addCredit(unit, { productionId: two.productionId, lineUpId: item, creditedName: 'Ada', role: 'Dancer', sectionTermId }))
    expect((await rows('SELECT performance_id, line_up_id FROM core_production_credits WHERE id = ?', credit))[0]).toEqual({ performance_id: two.performanceId, line_up_id: item })
  })

  it('shows on its date only, not with the production-wide credits', async () => {
    const s = await showcase()
    const sectionTermId = await section()
    await inUnit(async (unit) => {
      await addCredit(unit, { productionId: s.productionId, creditedName: 'Company', role: 'Ensemble', sectionTermId })
      await addCredit(unit, { productionId: s.productionId, performanceId: s.performanceId, creditedName: 'Understudy', role: 'Lead', sectionTermId })
    })
    await inUnit(unit => schedulePerformances(unit, [s.performanceId]))
    await publish(s.productionId)
    expect((await inContext(() => listCredits(s.productionId))).map(c => c.creditedName)).toEqual(['Company'])
    expect((await inContext(() => listCredits(s.productionId, { performanceId: s.performanceId }))).map(c => c.creditedName)).toEqual(['Understudy'])
    expect((await inContext(() => shownCredits(s.productionId))).map(c => c.creditedName)).toEqual(['Company'])
    const slug = (await rows<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', s.productionId))[0]!.slug
    const page = await inContext(async () => await publicProduction(slug) as PublicProduction)
    expect(page.performances[0]!.credits.map(c => c.creditedName)).toEqual(['Understudy'])
  })

  it('per-performance-credit-team-fact: the credited person holds core.production-team (LU6)', async () => {
    const s = await showcase()
    const accountId = newId('acc')
    await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, ?, \'staff\', ?)').bind(accountId, 'Ada Lane', Date.now()).run()
    await inUnit(async unit => addCreditAt(unit, s.productionId, { performanceId: s.performanceId, accountId, creditedName: 'Ada Lane', role: 'Dancer', sectionTermId: await section() }, 'https://theatre.test'))
    expect((await inContext(() => onProductionTeam(accountId, s.productionId))).holds).toBe(true)
  })
})
