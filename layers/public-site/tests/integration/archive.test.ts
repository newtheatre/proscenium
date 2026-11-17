// The archive of past shows (C-43, C-46, C-47): past productions by the year they opened, newest
// first; cancelled ones counted as past at once; unlisted, current and draft ones left out; a search
// across titles, companies and public credits that never finds a hidden or members-only credit; the
// earliest year from public-site.archive.from-year; and "not found" while past shows are not public.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import cancelProduction from '../../../core/server/api/core/productions/[id]/cancel.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedule from '../../../core/server/api/core/performances/[id]/schedule.post'
import addCredit from '../../../core/server/api/core/productions/[id]/credits/index.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import readArchive from '../../server/api/public-site/archive.get'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/cancel': cancelProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/productions/:id/credits': addCredit,
  'POST /api/core/venues': createVenue,
  'GET /api/public-site/archive': readArchive,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.production.cancel', 'core.performance.schedule', 'core.venue.manage'])

async function req<T = any>(method: string, path: string, body?: object, actor: ReturnType<typeof person> | undefined = admin): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
const archive = (query = '') => req('GET', `/api/public-site/archive${query}`, undefined, undefined)
const ids = (body: { productions: { id: string }[] }) => body.productions.map(p => p.id)
const term = async (vocabulary: string, slug: string) =>
  (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})

let venue: { venueId: string, spaceId: string }
async function show(title: string, options: { listed?: boolean, company?: string, publish?: boolean } = {}): Promise<string> {
  const { body } = await req('POST', '/api/core/productions', { title, kind: options.company ? 'visiting' : 'own' })
  await req('PATCH', `/api/core/productions/${body.id}`, {
    summary: 'A play.', categoryTermId: await term('core.production-category', 'play'), advisoriesConfirmedNone: true,
    listed: options.listed ?? true, companyName: options.company ?? null,
  })
  if (options.publish ?? true) expect((await req('POST', `/api/core/productions/${body.id}/publish`, {})).status).toBe(200)
  return body.id
}
// A scheduled date, then moved to when it was, as the completing task would leave it.
async function played(productionId: string, at: string): Promise<string> {
  const startsAt = Date.parse('2099-01-01T19:30:00Z')
  const { body } = await req('POST', `/api/core/productions/${productionId}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt })
  expect((await req('POST', `/api/core/performances/${body.id}/schedule`, {})).status).toBe(200)
  const start = Date.parse(at)
  await env.DB.prepare('UPDATE core_performances SET starts_at = ?, doors_at = NULL, ends_at = ?, state = \'completed\', completed_at = ? WHERE id = ?')
    .bind(start, start + 7_200_000, Date.now(), body.id).run()
  await env.DB.prepare('UPDATE core_productions SET first_starts_at = (SELECT min(starts_at) FROM core_performances WHERE production_id = ?1 AND state NOT IN (\'draft\', \'cancelled\')), last_ends_at = (SELECT max(ends_at) FROM core_performances WHERE production_id = ?1 AND state NOT IN (\'draft\', \'cancelled\')) WHERE id = ?1')
    .bind(productionId).run()
  return body.id
}
async function credit(productionId: string, creditedName: string, visibility: 'public' | 'members' | 'hidden' = 'public') {
  const { status, body } = await req('POST', `/api/core/productions/${productionId}/credits`, { creditedName, role: 'Director', sectionTermId: await term('core.credit-section', 'creative-team'), visibility })
  expect(status, JSON.stringify(body)).toBe(200)
}

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setting('core.locale.time-zone', 'Europe/London')
  if (!venue) venue = (await req('POST', '/api/core/venues', { name: 'The Archive Theatre' })).body
})
afterEach(async () => {
  await env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'public-site.%'").run()
})

describe('the archive by year', () => {
  it('files past shows under the year they opened, newest first', async () => {
    const autumn = await show('An Autumn Play')
    await played(autumn, '2011-10-01T18:30:00Z')
    await played(autumn, '2011-10-02T18:30:00Z')
    const spring = await show('A Spring Play')
    await played(spring, '2011-04-01T18:30:00Z')
    const eve = await show('New Year\'s Eve')
    await played(eve, '2010-12-31T19:30:00Z')
    const summer = await show('A Summer Night')
    await played(summer, '2012-06-30T19:30:00Z')

    const { status, body } = await archive('?year=2011')
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.year).toBe(2011)
    expect(ids(body).filter(id => [autumn, spring, eve, summer].includes(id))).toEqual([autumn, spring])
    expect(body.productions.find((p: { id: string }) => p.id === autumn)).toMatchObject({
      title: 'An Autumn Play', openedAt: Date.parse('2011-10-01T18:30:00Z'), closedAt: Date.parse('2011-10-02T20:30:00Z'), cancelled: false, venues: ['The Archive Theatre'], category: { slug: 'play' },
    })
    expect(ids((await archive('?year=2010')).body)).toContain(eve)
    expect(ids((await archive('?year=2012')).body)).toContain(summer)
    expect(body.years.map((y: { year: number }) => y.year)).toEqual([...body.years.map((y: { year: number }) => y.year)].sort((a, b) => b - a))
    expect(body.years).toEqual(expect.arrayContaining([{ year: 2011, count: expect.any(Number) }, { year: 2012, count: expect.any(Number) }]))
  })

  it('dates a show by the theatre\'s own new year, not the UTC one', async () => {
    // Noon on 31 December in UTC is already 1 January in Auckland.
    await setting('core.locale.time-zone', 'Pacific/Auckland')
    const s = await show('A New Year Gala')
    await played(s, '2018-12-31T12:00:00Z')
    expect(ids((await archive('?year=2019')).body)).toContain(s)
    // 2018 has nothing, so asking for it shows the newest year instead.
    expect((await archive('?year=2018')).body.year).not.toBe(2018)
  })

  it('shows the newest year when none is asked for, or one with nothing in it', async () => {
    const latest = await show('The Latest Past Show')
    await played(latest, '2026-02-01T19:30:00Z')
    const newest = (await archive()).body
    expect(newest.year).toBe(newest.years[0].year)
    expect((await archive('?year=1801')).body.year).toBe(newest.year)
  })

  it('counts a cancelled production at once, and leaves out current, unlisted and unpublished ones', async () => {
    const cancelled = await show('The Cancelled Play')
    const { body } = await req('POST', `/api/core/productions/${cancelled}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.parse('2099-03-01T19:30:00Z') })
    await req('POST', `/api/core/performances/${body.id}/schedule`, {})
    expect((await req('POST', `/api/core/productions/${cancelled}/cancel`, { reasonTermId: (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ?', 'core.cancel-reason'))[0]!.id })).status).toBe(200)
    const current = await show('The Current Play')
    await req('POST', `/api/core/productions/${current}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.parse('2099-03-02T19:30:00Z') })
      .then(r => req('POST', `/api/core/performances/${r.body.id}/schedule`, {}))
    const unlisted = await show('The Unlisted Play', { listed: false })
    await played(unlisted, '2013-05-01T19:30:00Z')
    const draft = await show('The Draft Play', { publish: false })
    await played(draft, '2013-05-02T19:30:00Z')

    const shown = (await archive('?year=2099')).body
    expect(ids(shown)).toContain(cancelled)
    expect(shown.productions.find((p: { id: string }) => p.id === cancelled)).toMatchObject({ cancelled: true })
    expect(ids(shown)).not.toContain(current)
    expect(ids((await archive('?year=2013')).body)).not.toEqual(expect.arrayContaining([unlisted]))
    expect(ids((await archive('?year=2013')).body)).not.toEqual(expect.arrayContaining([draft]))
  })
})

describe('searching the archive (C-43)', () => {
  it('finds a show by title, company or public credit, in any year, and every word must match', async () => {
    const hamlet = await show('Hamlet Revisited')
    await played(hamlet, '2014-03-01T19:30:00Z')
    await credit(hamlet, 'Zinnia Quillfeather')
    const visiting = await show('A Touring Piece', { company: 'Wandering Lanterns' })
    await played(visiting, '2015-03-01T19:30:00Z')

    expect(ids((await archive('?q=revisited')).body)).toEqual([hamlet])
    expect(ids((await archive('?q=quillfeather')).body)).toEqual([hamlet])
    expect(ids((await archive('?q=lanterns')).body)).toEqual([visiting])
    expect(ids((await archive('?q=hamlet+quill')).body)).toEqual([hamlet])
    expect(ids((await archive('?q=hamlet+lanterns')).body)).toEqual([])
    const searched = (await archive('?q=quillfeather')).body
    expect(searched).toMatchObject({ year: null, words: ['quillfeather'] })
  })

  it('never finds a hidden or members-only credit, nor any credit on a production whose credits are private', async () => {
    const s = await show('A Quiet Play')
    await played(s, '2016-03-01T19:30:00Z')
    await credit(s, 'Hidden Xanthippe', 'hidden')
    await credit(s, 'Members Ysolde', 'members')
    expect(ids((await archive('?q=xanthippe')).body)).toEqual([])
    expect(ids((await archive('?q=ysolde')).body)).toEqual([])

    const closed = await show('A Private Credits Play')
    await played(closed, '2016-04-01T19:30:00Z')
    await credit(closed, 'Ottoline Vexworth')
    await env.DB.prepare('UPDATE core_productions SET credits_public = 0 WHERE id = ?').bind(closed).run()
    expect(ids((await archive('?q=vexworth')).body)).toEqual([])
  })

  it('treats LIKE wildcards as letters, and says when every word is too short', async () => {
    const s = await show('One Hundred Percent')
    await played(s, '2017-03-01T19:30:00Z')
    expect(ids((await archive('?q=%25%25%25')).body)).toEqual([])
    expect((await archive('?q=ab')).body).toMatchObject({ searchTooShort: true, words: [] })
  })
})

describe('the archive\'s settings (C-47)', () => {
  it('leaves out years before public-site.archive.from-year, in the list and the search', async () => {
    const old = await show('An Ancient Revival')
    await played(old, '1995-03-01T19:30:00Z')
    expect(ids((await archive('?year=1995')).body)).toContain(old)
    await setting('public-site.archive.from-year', 2000)
    const after = (await archive('?year=1995')).body
    expect(after.years.every((y: { year: number }) => y.year >= 2000)).toBe(true)
    expect(ids(after)).not.toContain(old)
    expect(ids((await archive('?q=ancient')).body)).toEqual([])
  })

  it('answers not found while past shows are not public, or the public site is off', async () => {
    expect((await archive()).status).toBe(200)
    await setting('public-site.archive.public', false)
    expect((await archive()).status).toBe(404)
    expect((await archive('?q=hamlet')).status).toBe(404)
    await setting('public-site.archive.public', true)
    await setModule('public-site', false)
    expect((await archive()).status).toBe(404)
  })
})
