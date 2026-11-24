// A season's own public words (C-67): the season's and its productions' pages carry the first
// applying contributor's words, a failing one counts as not applying, and two at once give a health warning.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import createSeason from '../../../core/server/api/core/seasons/index.post'
import seasonState from '../../../core/server/api/core/seasons/[id]/state.post'
import readProduction from '../../server/api/public-site/productions/[slug].get'
import readSeason from '../../server/api/public-site/seasons/[slug].get'
import wordingHealth from '../../../core/server/contributions/core.health-check/public-wording'
import { resetRateLimits } from '#kit/ratelimit'
import { changeSetting, createUnit } from '#kit'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { worded } from '../../../../tests/fixtures/modules/worded/server/state'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/seasons': createSeason,
  'POST /api/core/seasons/:id/state': seasonState,
  'GET /api/public-site/productions/:slug': readProduction,
  'GET /api/public-site/seasons/:slug': readSeason,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.season.manage'])

async function ok(method: string, path: string, body: object) {
  const r = await call(handle, method, path, { actor: admin, body })
  const json = await r.json() as any
  expect(r.status, JSON.stringify(json)).toBe(200)
  return json
}
const visit = async (path: string) => (await call(handle, 'GET', path, {})).json() as Promise<any>
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})
const slugOf = async (table: string, id: string) => (await rows<{ slug: string }>(`SELECT slug FROM ${table} WHERE id = ?`, id))[0]!.slug

/** A published season with one published production in it. */
async function season() {
  const { id } = await ok('POST', '/api/core/seasons', { name: `Festival ${Math.random()}`, startsOn: '2030-01-01', endsOn: '2030-12-31' })
  await ok('POST', `/api/core/seasons/${id}/state`, { to: 'published' })
  const show = await ok('POST', '/api/core/productions', { title: `Opening ${Math.random()}`, kind: 'own' })
  const [category] = await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = \'core.production-category\' AND slug = \'play\'')
  await ok('PATCH', `/api/core/productions/${show.id}`, { summary: 'A show.', categoryTermId: category!.id, effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: 'https://tickets.example/book', seasonId: id })
  await ok('POST', `/api/core/productions/${show.id}/publish`, {})
  return { id, slug: await slugOf('core_seasons', id), showSlug: await slugOf('core_productions', show.id) }
}

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setModule('worded', true)
  await setting('core.locale.time-zone', 'Europe/London')
  // The categories a production needs, as making a venue would seed them.
  await inContext(() => ensureVocabularies())
  worded.events.clear()
  worded.acts.clear()
  worded.failing = false
})
afterEach(async () => {
  await setModule('worded', false)
})

describe('a season\'s public words', () => {
  it('keeps the usual words for a season no contributor applies to', async () => {
    const s = await season()
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).wording).toBeNull()
    expect((await visit(`/api/public-site/productions/${s.showSlug}`)).wording).toBeNull()
  })

  it('gives the season\'s pages and its productions\' pages the applying contributor\'s words', async () => {
    const s = await season()
    worded.acts.add(s.id)
    const words = { production: 'worded.act', performance: 'worded.set' }
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).wording).toEqual(words)
    expect((await visit(`/api/public-site/productions/${s.showSlug}`)).wording).toEqual(words)
  })

  it('uses the first in manifest order when two apply, warns on the health page, and skips one that fails', async () => {
    const s = await season()
    worded.events.add(s.id)
    worded.acts.add(s.id)
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).wording).toEqual({ production: 'worded.event', productions: 'worded.events' })
    const health = await inContext(() => wordingHealth.check())
    expect(health.state).toBe('warning')
    expect(health.sentence).toContain('worded.events, worded.acts')
    worded.failing = true
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).wording).toEqual({ production: 'worded.act', performance: 'worded.set' })
  })

  it('changes nothing while the contributing module is off', async () => {
    const s = await season()
    worded.acts.add(s.id)
    await setModule('worded', false)
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).wording).toBeNull()
    expect((await inContext(() => wordingHealth.check())).state).toBe('ok')
  })
})
