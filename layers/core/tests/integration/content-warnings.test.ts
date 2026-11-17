// The content warnings slice (part 2, "Later slice"): graded content warnings, ungraded staging
// effects, a minimum age, two publish answers and one guidance read. Names follow part 9's cases.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../server/api/core/productions/index.post'
import getProduction from '../../server/api/core/productions/[id]/index.get'
import patchProduction from '../../server/api/core/productions/[id]/index.patch'
import setAdvisories from '../../server/api/core/productions/[id]/advisories.put'
import setEffects from '../../server/api/core/productions/[id]/effects.put'
import publish from '../../server/api/core/productions/[id]/publish.post'
import { beforeYouCome, guidanceFor } from '../../server/programme/guidance'
import { ensureVocabularies, listTermGroups } from '../../server/vocabularies/service'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'

// Nothing in these tests sells tickets, so a production needs a booking link to publish (Matt, 2026-11-17).
const BOOKING = 'https://tickets.example/book'

const handle = server({
  'POST /api/core/productions': createProduction,
  'GET /api/core/productions/:id': getProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'PUT /api/core/productions/:id/advisories': setAdvisories,
  'PUT /api/core/productions/:id/effects': setEffects,
  'POST /api/core/productions/:id/publish': publish,
})
const admin = person(['core.production.create', 'core.production.publish', 'core.production.view'])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const req = (method: string, path: string, body?: object) => json(call(handle, method, path, { actor: admin, body }))

let n = 0
async function production(extra: object = {}): Promise<string> {
  const { status, body } = await req('POST', '/api/core/productions', { title: `Warned ${++n}`, kind: 'own', ...extra })
  expect(status).toBe(200)
  return body.id
}
async function term(vocabulary: string, slug: string): Promise<string> {
  await inContext(() => ensureVocabularies())
  return (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
}

beforeEach(() => resetRateLimits())

// Links in a job need the site's recorded address.
const record = (value: string) => rows("INSERT INTO core_settings (key, value, updated_at) VALUES ('core.site.origin', ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(value))
beforeAll(() => record('https://theatre.example'))
afterAll(() => rows("DELETE FROM core_settings WHERE key = 'core.site.origin'"))

describe('the vocabularies', () => {
  it('start grouped: content warnings under headings, effects with icons and no headings', async () => {
    await inContext(() => ensureVocabularies())
    const groups = await inContext(() => listTermGroups('core.advisory'))
    expect(groups).toHaveLength(9)
    const [live] = await rows<{ n: number, ungrouped: number }>("SELECT count(*) AS n, sum(group_id IS NULL) AS ungrouped FROM core_terms WHERE vocabulary_key = 'core.advisory' AND retired_at IS NULL")
    expect(live!.n).toBeGreaterThanOrEqual(50)
    expect(live!.ungrouped).toBe(0)
    expect(await inContext(() => listTermGroups('core.staging-effect'))).toEqual([])
    const effects = await rows<{ slug: string, icon: string | null }>("SELECT slug, icon FROM core_terms WHERE vocabulary_key = 'core.staging-effect'")
    expect(effects.map(e => e.slug)).toEqual(expect.arrayContaining(['strobe', 'haze', 'loud-noise', 'gunshots']))
    expect(effects.every(e => e.icon)).toBe(true)
  })
})

describe('a site made before headings existed', () => {
  it('gains the headings, the starting terms it lacks, and "Other" for a term of its own', async () => {
    await inContext(() => ensureVocabularies())
    await rows("UPDATE core_terms SET group_id = NULL WHERE vocabulary_key = 'core.advisory'")
    await rows("DELETE FROM core_term_groups WHERE vocabulary_key = 'core.advisory'")
    await rows("DELETE FROM core_terms WHERE vocabulary_key = 'core.advisory' AND slug = 'torture'")
    await rows("INSERT INTO core_terms (id, vocabulary_key, slug, label, sort, seeded, group_id, created_at) VALUES ('trm_own_puppetry', 'core.advisory', 'puppetry', 'Puppetry', 99, 0, NULL, 0)")
    await rows("UPDATE core_vocabularies SET grouped = 0 WHERE key = 'core.advisory'")
    await inContext(() => ensureVocabularies())
    const groups = await rows<{ label: string }>("SELECT label FROM core_term_groups WHERE vocabulary_key = 'core.advisory' ORDER BY sort")
    expect(groups.map(g => g.label).at(-1)).toBe('Other')
    expect(groups).toHaveLength(10)
    expect(await rows("SELECT 1 FROM core_terms WHERE vocabulary_key = 'core.advisory' AND slug = 'torture'")).toHaveLength(1)
    expect(await rows("SELECT 1 FROM core_terms WHERE vocabulary_key = 'core.advisory' AND group_id IS NULL")).toEqual([])
    expect((await rows<{ label: string }>("SELECT g.label FROM core_terms t JOIN core_term_groups g ON g.id = t.group_id WHERE t.id = 'trm_own_puppetry'"))[0]!.label).toBe('Other')
  })
})

describe('content warnings and effects', () => {
  it('refuse a content warning with no level', async () => {
    const id = await production()
    const violence = await term('core.advisory', 'violence')
    const refused = await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: violence }] })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(await rows('SELECT 1 FROM core_production_advisories WHERE production_id = ?', id)).toEqual([])
  })

  it('refuse a term from the wrong vocabulary in either table', async () => {
    const id = await production()
    const strobe = await term('core.staging-effect', 'strobe')
    const violence = await term('core.advisory', 'violence')
    expect((await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: strobe, level: 'depicted' }] })).body.code).toBe('core.production.advisory-unknown')
    expect((await req('PUT', `/api/core/productions/${id}/effects`, { effects: [{ termId: violence }] })).body.code).toBe('core.production.effect-unknown')
  })

  it('carry no level on an effect', async () => {
    const id = await production()
    const strobe = await term('core.staging-effect', 'strobe')
    expect((await req('PUT', `/api/core/productions/${id}/effects`, { effects: [{ termId: strobe, detail: 'Act two' }] })).status).toBe(200)
    const [row] = await rows<Record<string, unknown>>('SELECT * FROM core_production_effects WHERE production_id = ?', id)
    expect(row).toMatchObject({ term_id: strobe, detail: 'Act two' })
    expect(row).not.toHaveProperty('level')
  })

  it('need both answers to publish, and listing one clears its "none"', async () => {
    const id = await production()
    await req('PATCH', `/api/core/productions/${id}`, { summary: 'A play.', categoryTermId: await term('core.production-category', 'play'), advisoriesConfirmedNone: true, externalBookingUrl: BOOKING })
    expect((await req('POST', `/api/core/productions/${id}/publish`)).body.reason).toBe('To publish, the production needs its staging effects, or confirmation that it has none.')
    await req('PATCH', `/api/core/productions/${id}`, { effectsConfirmedNone: true })
    expect((await req('POST', `/api/core/productions/${id}/publish`)).status).toBe(200)

    const other = await production()
    await req('PATCH', `/api/core/productions/${other}`, { effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING })
    await req('PUT', `/api/core/productions/${other}/effects`, { effects: [{ termId: await term('core.staging-effect', 'haze') }] })
    await req('PUT', `/api/core/productions/${other}/advisories`, { advisories: [{ termId: await term('core.advisory', 'violence'), level: 'mentioned' }] })
    expect((await req('GET', `/api/core/productions/${other}`)).body.production).toMatchObject({ effectsConfirmedNone: false, advisoriesConfirmedNone: false })
  })

  it('keep a minimum age from 0 to 21, and a restriction only with an age', async () => {
    const id = await production()
    expect((await req('PATCH', `/api/core/productions/${id}`, { ageRestricted: true })).body.code).toBe('core.production.age-needed')
    expect((await req('PATCH', `/api/core/productions/${id}`, { ageMin: 22 })).status).toBeGreaterThanOrEqual(400)
    expect((await req('PATCH', `/api/core/productions/${id}`, { ageMin: 18, ageRestricted: true })).status).toBe(200)
    expect((await req('PATCH', `/api/core/productions/${id}`, { ageMin: null })).body.code).toBe('core.production.age-needed')
    expect((await req('GET', `/api/core/productions/${id}`)).body.production).toMatchObject({ ageMin: 18, ageRestricted: true })
  })

  it('announce what a change added, by term and level, never a person', async () => {
    const id = await production()
    await req('PATCH', `/api/core/productions/${id}`, { summary: 'A play.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING })
    await req('POST', `/api/core/productions/${id}/publish`)
    const strobe = await term('core.staging-effect', 'strobe')
    const violence = await term('core.advisory', 'violence')
    await req('PUT', `/api/core/productions/${id}/effects`, { effects: [{ termId: strobe }] })
    await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: violence, level: 'mentioned' }] })
    await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: violence, level: 'depicted' }] })
    const events = (await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'core.production.updated' AND record_id = ? ORDER BY rowid", id)).map(e => JSON.parse(e.payload))
    expect(events.map(e => e.guidanceAdded)).toEqual([
      { effectTermIds: [strobe], warnings: [] },
      { effectTermIds: [], warnings: [{ termId: violence, level: 'mentioned' }] },
      { effectTermIds: [], warnings: [{ termId: violence, level: 'depicted' }] },
    ])
  })
})

describe('guidanceFor', () => {
  it('orders warnings by seriousness, then heading, then term, whatever order they were saved in', async () => {
    const id = await production()
    const pick = async (slug: string) => term('core.advisory', slug)
    await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [
      { termId: await pick('strong-language'), level: 'mentioned' },
      { termId: await pick('violence'), level: 'depicted' },
      { termId: await pick('suicide'), level: 'discussed' },
      { termId: await pick('blood-gore'), level: 'depicted' },
    ] })
    const g = (await inContext(() => guidanceFor(id)))!
    expect(g.warnings.map(w => [w.label, w.level])).toEqual([['Violence', 'depicted'], ['Blood and gore', 'depicted'], ['Suicide', 'discussed'], ['Strong language', 'mentioned']])
    expect(g.warnings[0]!.heading).toBe('Violence and harm')
  })

  it('shows a merged term once, under the surviving label, at the more serious level', async () => {
    const id = await production()
    const keep = await term('core.advisory', 'violence')
    const gone = await term('core.advisory', 'weapons')
    await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: keep, level: 'mentioned' }, { termId: gone, level: 'depicted', detail: 'A knife' }] })
    await rows('UPDATE core_terms SET merged_into_id = ?, retired_at = 1 WHERE id = ?', keep, gone)
    const g = (await inContext(() => guidanceFor(id)))!
    expect(g.warnings).toHaveLength(1)
    expect(g.warnings[0]).toMatchObject({ label: 'Violence', level: 'depicted', detail: 'A knife' })
  })

  it('answers whether each question has been answered', async () => {
    const id = await production()
    expect(await inContext(() => guidanceFor(id))).toMatchObject({ effectsAnswered: false, warningsAnswered: false })
    await req('PATCH', `/api/core/productions/${id}`, { effectsConfirmedNone: true })
    expect(await inContext(() => guidanceFor(id))).toMatchObject({ effectsAnswered: true, warningsAnswered: false })
    expect(await inContext(() => guidanceFor('missing'))).toBeNull()
  })
})

describe('beforeYouCome', () => {
  it('holds no content warning, only whether there are any', async () => {
    const id = await production({ title: 'Quiet Email Show' })
    await req('PATCH', `/api/core/productions/${id}`, { ageMin: 14 })
    await req('PUT', `/api/core/productions/${id}/effects`, { effects: [{ termId: await term('core.staging-effect', 'haze'), detail: 'Throughout' }] })
    await req('PUT', `/api/core/productions/${id}/advisories`, { advisories: [{ termId: await term('core.advisory', 'self-harm'), level: 'depicted', detail: 'A secret detail' }] })
    const block = (await inContext(() => beforeYouCome(id)))!
    expect(block).toMatchObject({ ageMin: 14, ageRestricted: false, hasContentWarnings: true, empty: false })
    expect(block.effects).toEqual([expect.objectContaining({ label: 'Haze or smoke', detail: 'Throughout' })])
    expect(block.pageUrl).toBe('https://theatre.example/whats-on/quiet-email-show')
    const text = JSON.stringify(block)
    for (const secret of ['Self-harm', 'self-harm', 'A secret detail', 'depicted']) expect(text).not.toContain(secret)
  })

  it('is empty when there is nothing to say', async () => {
    const id = await production()
    expect((await inContext(() => beforeYouCome(id)))!.empty).toBe(true)
  })
})
