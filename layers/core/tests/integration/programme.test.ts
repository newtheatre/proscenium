// Part 3's season and production moves, C-01 to C-03 and the slug rule: publishing needs a summary,
// a category and an answer on staging effects and on content warnings; an old web address redirects for ever and is never given
// to another production; a published production announces changes to public fields only.
import { beforeEach, describe, expect, it } from 'vitest'
import listSeasons from '../../server/api/core/seasons/index.get'
import createSeason from '../../server/api/core/seasons/index.post'
import patchSeason from '../../server/api/core/seasons/[id]/index.patch'
import moveSeason from '../../server/api/core/seasons/[id]/state.post'
import deleteSeason from '../../server/api/core/seasons/[id]/index.delete'
import listProductions from '../../server/api/core/productions/index.get'
import createProduction from '../../server/api/core/productions/index.post'
import getProduction from '../../server/api/core/productions/[id]/index.get'
import patchProduction from '../../server/api/core/productions/[id]/index.patch'
import setAdvisories from '../../server/api/core/productions/[id]/advisories.put'
import setEffects from '../../server/api/core/productions/[id]/effects.put'
import publish from '../../server/api/core/productions/[id]/publish.post'
import withdraw from '../../server/api/core/productions/[id]/withdraw.post'
import deleteProduction from '../../server/api/core/productions/[id]/index.delete'
import duplicateProduction from '../../server/api/core/productions/[id]/duplicate.post'
import { productionBySlug } from '../../server/services'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'

// Nothing in these tests sells tickets, so a production needs a booking link to publish (Matt, 2026-11-17).
const BOOKING = 'https://tickets.example/book'

const handle = server({
  'GET /api/core/seasons': listSeasons,
  'POST /api/core/seasons': createSeason,
  'PATCH /api/core/seasons/:id': patchSeason,
  'POST /api/core/seasons/:id/state': moveSeason,
  'DELETE /api/core/seasons/:id': deleteSeason,
  'GET /api/core/productions': listProductions,
  'POST /api/core/productions': createProduction,
  'GET /api/core/productions/:id': getProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'PUT /api/core/productions/:id/advisories': setAdvisories,
  'PUT /api/core/productions/:id/effects': setEffects,
  'POST /api/core/productions/:id/publish': publish,
  'POST /api/core/productions/:id/withdraw': withdraw,
  'DELETE /api/core/productions/:id': deleteProduction,
  'POST /api/core/productions/:id/duplicate': duplicateProduction,
})
const admin = person(['core.production.create', 'core.production.publish', 'core.season.manage'])
const viewer = person(['core.production.view'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object, actor = admin) => json(call(handle, method, path, { actor, body }))

let n = 0
async function production(extra: object = {}): Promise<string> {
  const { status, body } = await req('POST', '/api/core/productions', { title: `Show ${++n}`, kind: 'own', ...extra })
  expect(status).toBe(200)
  return body.id
}
async function read(id: string) {
  return (await req('GET', `/api/core/productions/${id}`)).body
}
async function term(vocabulary: string, slug: string): Promise<string> {
  await inContext(async () => (await import('../../server/vocabularies/service')).ensureVocabularies())
  return (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
}
async function ready(id: string) {
  await req('PATCH', `/api/core/productions/${id}`, { summary: 'A play about a play.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING })
}

beforeEach(() => {
  resetRateLimits()
})

describe('seasons', () => {
  it('may be one day long, never end before they start, and keep names unique', async () => {
    const one = await req('POST', '/api/core/seasons', { name: 'Gala night', startsOn: '2027-03-01', endsOn: '2027-03-01' })
    expect(one.status).toBe(200)
    expect((await req('POST', '/api/core/seasons', { name: 'Backwards', startsOn: '2027-03-02', endsOn: '2027-03-01' })).body.code).toBe('core.season.dates')
    expect((await req('POST', '/api/core/seasons', { name: 'GALA NIGHT', startsOn: '2027-03-01', endsOn: '2027-03-02' })).body.code).toBe('core.season.name-taken')
  })

  it('go back to draft only while none of their productions is published, and delete only when empty', async () => {
    const { body: { id } } = await req('POST', '/api/core/seasons', { name: 'Spring 2027', startsOn: '2027-01-10', endsOn: '2027-04-10' })
    expect((await req('POST', `/api/core/seasons/${id}/state`, { to: 'published' })).status).toBe(200)
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.season.published', id)).toHaveLength(1)
    const show = await production({ seasonId: id })
    await ready(show)
    await req('POST', `/api/core/productions/${show}/publish`)
    expect((await req('POST', `/api/core/seasons/${id}/state`, { to: 'draft' })).body.code).toBe('core.season.has-published')
    await req('POST', `/api/core/productions/${show}/withdraw`)
    expect((await req('POST', `/api/core/seasons/${id}/state`, { to: 'draft' })).status).toBe(200)
    expect((await req('DELETE', `/api/core/seasons/${id}`)).body.code).toBe('core.season.in-use')
    await req('PATCH', `/api/core/productions/${show}`, { seasonId: null })
    expect((await req('DELETE', `/api/core/seasons/${id}`)).status).toBe(200)
  })
})

describe('productions', () => {
  it('start as drafts, slugged from the title, with credits public as the setting says', async () => {
    const id = await production({ title: 'The Cherry Orchard' })
    const { production: p } = await read(id)
    expect(p).toMatchObject({ slug: 'the-cherry-orchard', state: 'draft', creditsPublic: true, kind: 'own' })
    const again = await production({ title: 'The Cherry Orchard' })
    expect((await read(again)).production.slug).toBe('the-cherry-orchard-2')
  })

  it('need the abilities, and a grant on one production edits that one only', async () => {
    const id = await production()
    const other = await production()
    expect((await req('POST', '/api/core/productions', { title: 'Nope', kind: 'own' }, viewer)).status).toBe(403)
    expect((await req('PATCH', `/api/core/productions/${id}`, { subtitle: 'Nope' }, viewer)).status).toBe(403)
    const lead = person([], { grants: [{ ability: 'core.production.edit', via: 'grant', record: { type: 'core.production', id } }] } as any)
    expect((await req('PATCH', `/api/core/productions/${id}`, { subtitle: 'A comedy' }, lead)).status).toBe(200)
    expect((await req('PATCH', `/api/core/productions/${other}`, { subtitle: 'A comedy' }, lead)).status).toBe(403)
    expect((await req('POST', `/api/core/productions/${id}/publish`, {}, lead)).status).toBe(403)
  })

  it('publish only with a summary, a category, an answer on staging effects and content warnings, and a booking link when nothing sells tickets', async () => {
    const id = await production()
    const refused = await req('POST', `/api/core/productions/${id}/publish`)
    expect(refused.status).toBe(422)
    expect(refused.body).toMatchObject({ code: 'core.production.not-ready', reason: 'This production needs 5 more things before it can be published.' })
    expect(refused.body.remedy).toBe('Still to do: a summary; a category; staging effects listed, or none confirmed; content warnings listed, or none confirmed; a booking link, as nothing here sells tickets.')
    // The page's "Ready to publish?" lines that stop publishing are the same list, in the same words.
    const needs = (await read(id)).needs
    expect(needs.map((n: { key: string }) => n.key)).toEqual(['summary', 'category', 'effects', 'advisories', 'booking'])
    expect(needs[4]).toEqual({ key: 'booking', sentence: 'A booking link, as nothing here sells tickets', link: `/console/programme/productions/${id}?tab=details` })

    await req('PATCH', `/api/core/productions/${id}`, { summary: 'Short.', categoryTermId: await term('core.production-category', 'comedy'), externalBookingUrl: BOOKING })
    const strobe = await term('core.advisory', (await rows<{ slug: string }>("SELECT slug FROM core_terms WHERE vocabulary_key = 'core.advisory' LIMIT 1"))[0]!.slug)
    expect((await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: strobe, level: 'discussed', detail: 'In act two' }] })).status).toBe(200)
    // Content warnings alone are half the answer: the effects still need listing or confirming as none.
    expect((await req('POST', `/api/core/productions/${id}/publish`)).body).toMatchObject({ reason: 'This production needs 1 more thing before it can be published.', remedy: 'Still to do: staging effects listed, or none confirmed.' })
    await req('PATCH', `/api/core/productions/${id}`, { effectsConfirmedNone: true })
    expect((await req('POST', `/api/core/productions/${id}/publish`)).status).toBe(200)
    expect((await read(id)).production).toMatchObject({ state: 'published' })
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.production.published', id)).toHaveLength(1)

    // Once published, it cannot be left without an answer on advisories, a summary or a category.
    expect((await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [] })).body.code).toBe('core.production.advisories-needed')
    expect((await req('PUT', `/api/core/productions/${id}/effects`, { effects: [] })).status).toBe(200)
    expect((await req('PATCH', `/api/core/productions/${id}`, { effectsConfirmedNone: false })).body.code).toBe('core.production.effects-needed')
    expect((await req('PATCH', `/api/core/productions/${id}`, { summary: null })).body.code).toBe('core.production.needed-to-publish')
    // With nothing here selling tickets, it cannot be left without its booking link either.
    expect((await req('PATCH', `/api/core/productions/${id}`, { externalBookingUrl: null })).body.code).toBe('core.production.booking-link-needed')
  })

  it('announce changes to public fields of a published production, by name only', async () => {
    const id = await production()
    await ready(id)
    await req('POST', `/api/core/productions/${id}/publish`)
    await req('PATCH', `/api/core/productions/${id}`, { subtitle: 'Now with songs', kind: 'visiting' })
    const [event] = await rows<{ payload: string }>('SELECT payload FROM core_events WHERE name = ? AND record_id = ?', 'core.production.updated', id)
    expect(JSON.parse(event!.payload)).toEqual({ productionId: id, fields: ['subtitle'] })
  })

  it('keep an old web address once public, and never give it to another production', async () => {
    const id = await production({ title: 'Hamlet' })
    // A draft's address was never public, so changing it leaves nothing behind.
    await req('PATCH', `/api/core/productions/${id}`, { slug: 'hamlet-draft' })
    await req('PATCH', `/api/core/productions/${id}`, { slug: 'hamlet' })
    expect(await rows('SELECT slug FROM core_production_slugs WHERE production_id = ?', id)).toEqual([])
    await ready(id)
    await req('POST', `/api/core/productions/${id}/publish`)
    expect((await req('PATCH', `/api/core/productions/${id}`, { slug: 'hamlet-2027' })).status).toBe(200)
    expect(await inContext(() => productionBySlug('hamlet'))).toEqual({ id, slug: 'hamlet-2027', moved: true })

    const other = await production({ title: 'Another' })
    expect((await req('PATCH', `/api/core/productions/${other}`, { slug: 'hamlet' })).body.code).toBe('core.production.slug-taken')
    expect((await req('POST', '/api/core/productions', { title: 'Hamlet', kind: 'own' })).status).toBe(200)
    expect((await rows<{ slug: string }>("SELECT slug FROM core_productions WHERE title = 'Hamlet' AND id != ?", id))[0]!.slug).toBe('hamlet-2')
    // Going back to an old address of its own is fine.
    expect((await req('PATCH', `/api/core/productions/${id}`, { slug: 'hamlet' })).status).toBe(200)
  })

  it('delete only while a draft that was never published', async () => {
    const id = await production()
    await ready(id)
    await req('POST', `/api/core/productions/${id}/publish`)
    await req('POST', `/api/core/productions/${id}/withdraw`)
    expect((await req('DELETE', `/api/core/productions/${id}`)).body.code).toBe('core.production.not-deletable')
    const draft = await production()
    expect((await req('DELETE', `/api/core/productions/${draft}`)).status).toBe(200)
  })

  it('duplicate as a new draft with the details and guidance, but not the season, state or web address', async () => {
    const season = (await req('POST', '/api/core/seasons', { name: 'Duplicating season', startsOn: '2027-01-01', endsOn: '2027-06-30' })).body.id
    const id = await production({ title: 'Twelfth Night', seasonId: season })
    await ready(id)
    await req('POST', `/api/core/productions/${id}/publish`)
    const copied = await req('POST', `/api/core/productions/${id}/duplicate`)
    expect(copied.status).toBe(200)
    const { production: copy, needs } = await read(copied.body.id)
    expect(copy).toMatchObject({ title: 'Twelfth Night (copy)', slug: 'twelfth-night-copy', state: 'draft', seasonId: null, summary: 'A play about a play.', effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING, publishedAt: null })
    expect(needs).toEqual([])
    expect((await req('POST', `/api/core/productions/${id}/duplicate`, {}, viewer)).status).toBe(403)
  })

  it('list with search and filters', async () => {
    await production({ title: 'Uncle Vanya', companyName: 'Moscow Art Collective', kind: 'visiting' })
    const found = await req('GET', '/api/core/productions?q=moscow', undefined, viewer)
    expect(found.body.rows.map((p: { title: string }) => p.title)).toEqual(['Uncle Vanya'])
    const drafts = await req('GET', '/api/core/productions?state=draft&size=100', undefined, viewer)
    expect(drafts.body.rows.every((p: { state: string }) => p.state === 'draft')).toBe(true)
  })
})
