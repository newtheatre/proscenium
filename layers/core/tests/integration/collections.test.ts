// C-60: collections of productions with a page of their own (festival-ready changes, CL1 to CL4).
import { beforeEach, describe, expect, it } from 'vitest'
import createCollectionRoute from '../../server/api/core/collections/index.post'
import listRoute from '../../server/api/core/collections/index.get'
import getRoute from '../../server/api/core/collections/[id]/index.get'
import patchRoute from '../../server/api/core/collections/[id]/index.patch'
import stateRoute from '../../server/api/core/collections/[id]/state.post'
import addRoute from '../../server/api/core/collections/[id]/productions.post'
import orderRoute from '../../server/api/core/collections/[id]/productions.put'
import pickRoute from '../../server/api/core/productions/[id]/collections.put'
import patchProduction from '../../server/api/core/productions/[id]/index.patch'
import { createProduction } from '../../server/services'
import { collectionsFor, publicCollection } from '../../server/programme/collections'
import { duplicateProduction } from '../../server/programme/service'
import { createUnit, newId, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const admin = person(['core.collection.manage', 'core.production.view', 'core.production.edit', 'core.production.create'])
const handle = server({
  'POST /api/core/collections': createCollectionRoute,
  'GET /api/core/collections': listRoute,
  'GET /api/core/collections/:id': getRoute,
  'PATCH /api/core/collections/:id': patchRoute,
  'POST /api/core/collections/:id/state': stateRoute,
  'POST /api/core/collections/:id/productions': addRoute,
  'PUT /api/core/collections/:id/productions': orderRoute,
  'PUT /api/core/productions/:id/collections': pickRoute,
  'PATCH /api/core/productions/:id': patchProduction,
})
const req = async (method: string, path: string, body?: object, actor = admin) => {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as any }
}
const inUnit = <T>(fn: (unit: UnitView) => Promise<T>) => inContext(async () => {
  const unit = createUnit()
  const out = await fn(unit)
  await unit.commit()
  return out
}, admin)

let n = 0
async function season(): Promise<string> {
  const id = newId('sea')
  await env.DB.prepare('INSERT INTO core_seasons (id, slug, name, starts_on, ends_on, state, sort, created_at) VALUES (?, ?, ?, \'2031-01-01\', \'2031-12-31\', \'published\', 0, ?)').bind(id, `season-${++n}`, `Season ${n}`, Date.now()).run()
  return id
}
const production = (seasonId: string | null = null, title = `Show ${++n}`) => inUnit(unit => createProduction(unit, { title, kind: 'own', seasonId }))
const publish = (id: string, lastEndsAt: number | null = null) => rows("UPDATE core_productions SET state = 'published', published_at = 1, summary = 's', last_ends_at = ? WHERE id = ?", lastEndsAt, id)
async function collection(body: object = {}): Promise<string> {
  const r = await req('POST', '/api/core/collections', { name: `Strand ${++n}`, colour: '#1d4ed8', ...body })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.id
}
const slugOf = async (id: string) => (await rows<{ slug: string }>('SELECT slug FROM core_collections WHERE id = ?', id))[0]!.slug

beforeEach(() => resetRateLimits())

describe('a collection', () => {
  it('has a name of its own and a colour text can be read on', async () => {
    await collection({ name: 'StageFest' })
    expect((await req('POST', '/api/core/collections', { name: 'stagefest', colour: '#1d4ed8' })).body.code).toBe('core.collection.name-taken')
    expect((await req('POST', '/api/core/collections', { name: 'Grey', colour: '#777777' })).body.code).toBe('core.collection.colour-contrast')
  })

  it('collection-season-bound-refuses-other-season: takes only its season\'s productions (CL1)', async () => {
    const [autumn, spring] = [await season(), await season()]
    const fest = await collection({ seasonId: autumn })
    const [inside, outside] = [await production(autumn), await production(spring)]
    expect((await req('POST', `/api/core/collections/${fest}/productions`, { productionIds: [inside] })).status).toBe(200)
    expect((await req('POST', `/api/core/collections/${fest}/productions`, { productionIds: [outside] })).body.code).toBe('core.collection.other-season')
    // A production made with the collection named, in another season, is refused on the statement too.
    await expect(inUnit(unit => createProduction(unit, { title: 'Late entry', kind: 'own', seasonId: spring, collectionIds: [fest] }))).rejects.toMatchObject({ code: 'core.collection.other-season' })
    const made = await inUnit(unit => createProduction(unit, { title: 'On time', kind: 'own', seasonId: autumn, collectionIds: [fest] }))
    expect((await rows('SELECT production_id FROM core_collection_productions WHERE collection_id = ? ORDER BY sort', fest)).map(r => r.production_id)).toEqual([inside, made])
  })

  it('collection-production-season-change-refused: a member keeps its season while in a bound collection', async () => {
    const [autumn, spring] = [await season(), await season()]
    const name = `Fest ${n}`
    const fest = await collection({ name, seasonId: autumn })
    const p = await production(autumn)
    await req('POST', `/api/core/collections/${fest}/productions`, { productionIds: [p] })
    const moved = await req('PATCH', `/api/core/productions/${p}`, { seasonId: spring })
    expect(moved.body.code).toBe('core.production.in-season-collection')
    expect(moved.body.remedy).toBe(`Remove it from ${name} first.`)
    await req('PUT', `/api/core/productions/${p}/collections`, { collectionIds: [] })
    expect((await req('PATCH', `/api/core/productions/${p}`, { seasonId: spring })).status).toBe(200)
  })

  it('publishes only with a production, and goes back to draft only while none is published', async () => {
    const c = await collection()
    expect((await req('POST', `/api/core/collections/${c}/state`, { to: 'published' })).body.code).toBe('core.collection.empty')
    const p = await production()
    await req('POST', `/api/core/collections/${c}/productions`, { productionIds: [p] })
    expect((await req('POST', `/api/core/collections/${c}/state`, { to: 'published' })).status).toBe(200)
    await publish(p)
    expect((await req('POST', `/api/core/collections/${c}/state`, { to: 'draft' })).body.code).toBe('core.collection.has-published')
    expect((await req('POST', `/api/core/collections/${c}/state`, { to: 'archived' })).status).toBe(200)
  })

  it('collection-page-hides-drafts: shows published members, current first; staff count every one (CL2, CL3)', async () => {
    const c = await collection()
    const [old, draft, next] = [await production(null, 'Old show'), await production(null, 'Draft show'), await production(null, 'Next show')]
    await req('POST', `/api/core/collections/${c}/productions`, { productionIds: [old, draft, next] })
    await publish(old, Date.now() - 86_400_000)
    await publish(next)
    await req('POST', `/api/core/collections/${c}/state`, { to: 'published' })
    const page = await inContext(async () => await publicCollection(await slugOf(c)) as { productions: { title: string, past: boolean }[] })
    expect(page.productions.map(p => [p.title, p.past])).toEqual([['Next show', false], ['Old show', true]])
    expect((await req('GET', '/api/core/collections')).body.collections.find((x: { id: string }) => x.id === c).productions).toBe(3)
    await req('PUT', `/api/core/collections/${c}/productions`, { productionIds: [next, draft, old] })
    expect((await req('GET', `/api/core/collections/${c}`)).body.members.map((m: { title: string }) => m.title)).toEqual(['Next show', 'Draft show', 'Old show'])
  })

  it('answers an archived page only while past shows are public, and an old address with the new one', async () => {
    const c = await collection()
    await req('POST', `/api/core/collections/${c}/productions`, { productionIds: [await production()] })
    await req('POST', `/api/core/collections/${c}/state`, { to: 'published' })
    const before = await slugOf(c)
    await req('PATCH', `/api/core/collections/${c}`, { slug: `${before}-renamed` })
    expect(await inContext(() => publicCollection(before))).toEqual({ moved: `${before}-renamed` })
    await req('POST', `/api/core/collections/${c}/state`, { to: 'archived' })
    expect(await inContext(() => publicCollection(`${before}-renamed`, { pastVisible: false }))).toBeNull()
    expect(await inContext(() => publicCollection(`${before}-renamed`))).toMatchObject({ archived: true })
  })

  it('is copied with a duplicated production only when standing (CL4)', async () => {
    const autumn = await season()
    const [standing, bound] = [await collection(), await collection({ seasonId: autumn })]
    const p = await production(autumn)
    await req('PUT', `/api/core/productions/${p}/collections`, { collectionIds: [standing, bound] })
    const copy = await inUnit(unit => duplicateProduction(unit, p, null))
    expect((await rows('SELECT collection_id FROM core_collection_productions WHERE production_id = ?', copy)).map(r => r.collection_id)).toEqual([standing])
  })

  it('needs core.collection.manage on each collection a production is put in', async () => {
    const c = await collection()
    const p = await production()
    const editor = person(['core.production.edit'])
    expect((await req('PUT', `/api/core/productions/${p}/collections`, { collectionIds: [c] }, editor)).status).toBe(403)
    expect(await rows('SELECT 1 FROM core_collection_productions WHERE production_id = ?', p)).toEqual([])
  })

  it('collections-for answers set-wise for many productions in one bound parameter', async () => {
    const c = await collection()
    const p = await production()
    await req('POST', `/api/core/collections/${c}/productions`, { productionIds: [p] })
    const ids = [p, ...Array.from({ length: 499 }, (_, i) => `prd_none${i}`)]
    const map = await inContext(() => collectionsFor(ids))
    expect(map.size).toBe(500)
    expect(map.get(p)!.map(x => x.id)).toEqual([c])
  })
})
