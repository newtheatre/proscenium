// Filtering what's on (C-38, the screen's filters and the whats-on content component's props): by
// category, season, venue and month in the theatre's time zone, at most `limit`, and the choices on
// offer drawn only from what is on now. A filter that is not well formed is ignored.
import { beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedule from '../../../core/server/api/core/performances/[id]/schedule.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import createSeason from '../../../core/server/api/core/seasons/index.post'
import seasonState from '../../../core/server/api/core/seasons/[id]/state.post'
import listProductions from '../../server/api/public-site/productions/index.get'
import readFilters from '../../server/api/public-site/whats-on-filters.get'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

// Nothing in these tests sells tickets, so a production needs a booking link to publish (Matt, 2026-11-17).
const BOOKING = 'https://tickets.example/book'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/venues': createVenue,
  'POST /api/core/seasons': createSeason,
  'POST /api/core/seasons/:id/state': seasonState,
  'GET /api/public-site/productions': listProductions,
  'GET /api/public-site/whats-on-filters': readFilters,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.venue.manage', 'core.season.manage'])

async function req<T = any>(method: string, path: string, body?: object, actor: ReturnType<typeof person> | undefined = admin): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
// The database is shared by the file's tests, so each test looks only at the productions it made.
const listed = async (query = '', mine?: string[]) => ((await req('GET', `/api/public-site/productions${query}`, undefined, undefined)).body.productions as { id: string }[])
  .map(p => p.id).filter(id => !mine || mine.includes(id))
const term = async (vocabulary: string, slug: string) =>
  (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})

async function venue(name: string): Promise<{ venueId: string, spaceId: string, slug: string }> {
  const { body } = await req('POST', '/api/core/venues', { name })
  return { ...body, slug: (await rows<{ slug: string }>('SELECT slug FROM core_venues WHERE id = ?', body.venueId))[0]!.slug }
}
async function season(name: string, state: 'draft' | 'published'): Promise<{ id: string, slug: string }> {
  const { status, body } = await req('POST', '/api/core/seasons', { name, startsOn: '2029-01-01', endsOn: '2029-12-31' })
  expect(status, JSON.stringify(body)).toBe(200)
  if (state === 'published') expect((await req('POST', `/api/core/seasons/${body.id}/state`, { to: 'published' })).status).toBe(200)
  return { id: body.id, slug: (await rows<{ slug: string }>('SELECT slug FROM core_seasons WHERE id = ?', body.id))[0]!.slug }
}
async function show(title: string, options: { category?: string, seasonId?: string } = {}): Promise<string> {
  const { body } = await req('POST', '/api/core/productions', { title, kind: 'own' })
  await req('PATCH', `/api/core/productions/${body.id}`, {
    summary: 'A show.', categoryTermId: await term('core.production-category', options.category ?? 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING, seasonId: options.seasonId ?? null,
  })
  expect((await req('POST', `/api/core/productions/${body.id}/publish`, {})).status).toBe(200)
  return body.id
}
async function date(productionId: string, at: { venueId: string, spaceId: string }, startsAt: string) {
  const { status, body } = await req('POST', `/api/core/productions/${productionId}/performances`, { venueId: at.venueId, spaceId: at.spaceId, startsAt: Date.parse(startsAt) })
  expect(status, JSON.stringify(body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${body.id}/schedule`, {})).status).toBe(200)
}

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setting('core.locale.time-zone', 'Europe/London')
})

describe('filtering what\'s on', () => {
  it('narrows by category, season, venue and month, and the filters combine', async () => {
    const main = await venue('The Main House')
    const studio = await venue('The Studio')
    const spring = await season('Spring 2029', 'published')
    const hidden = await season('Secret Season', 'draft')
    const play = await show('A Play', { seasonId: spring.id })
    await date(play, main, '2029-03-10T19:30:00Z')
    await date(play, studio, '2029-04-10T18:30:00Z')
    const musical = await show('A Musical', { category: 'musical', seasonId: hidden.id })
    await date(musical, studio, '2029-03-20T19:30:00Z')

    const mine = [play, musical]
    expect(await listed('', mine)).toEqual([play, musical])
    expect(await listed('?category=musical', mine)).toEqual([musical])
    expect(await listed(`?season=${spring.slug}`, mine)).toEqual([play])
    // A season the public cannot see narrows to nothing rather than revealing what is in it.
    expect(await listed(`?season=${hidden.slug}`, mine)).toEqual([])
    // At the studio the musical (20 March) comes before the play's date there (10 April).
    expect(await listed(`?venue=${studio.slug}`, mine)).toEqual([musical, play])
    expect(await listed('?month=2029-04', mine)).toEqual([play])
    expect(await listed(`?venue=${main.slug}&category=musical`, mine)).toEqual([])
    // Only the dates at the chosen venue count, so the run shown is the run there.
    const atStudio = (await req('GET', `/api/public-site/productions?venue=${studio.slug}`, undefined, undefined)).body.productions
    expect(atStudio.find((p: { id: string }) => p.id === play)).toMatchObject({ nextStartsAt: Date.parse('2029-04-10T18:30:00Z'), venues: ['The Studio'] })
  })

  it('counts a month in the theatre\'s time zone', async () => {
    const at = await venue('The Late House')
    // 00:30 on 1 May in London is still 30 April in UTC.
    const late = await show('A Midnight Show')
    await date(late, at, '2029-04-30T23:30:00Z')
    expect(await listed('?month=2029-05', [late])).toEqual([late])
    expect(await listed('?month=2029-04', [late])).toEqual([])
  })

  it('shows at most the limit, soonest first, and ignores a filter that is not well formed', async () => {
    // Sooner than anything else the file makes, so the limit falls on these.
    const at = await venue('The Limit House')
    const first = await show('First')
    await date(first, at, '2028-06-01T19:30:00Z')
    const second = await show('Second')
    await date(second, at, '2028-06-02T19:30:00Z')
    const third = await show('Third')
    await date(third, at, '2028-06-03T19:30:00Z')
    expect(await listed('?limit=2')).toEqual([first, second])
    expect(await listed('?limit=0&month=2029-13&category=Not%20A%20Slug', [first, second, third])).toEqual([first, second, third])
  })
})

describe('the choices on offer', () => {
  it('offers only the categories, public seasons, venues and months that something on now has', async () => {
    const main = await venue('The Offer House')
    await venue('An Empty Hall')
    const spring = await season('Offered Season', 'published')
    const hidden = await season('Unoffered Season', 'draft')
    const play = await show('An Offered Play', { seasonId: spring.id })
    await date(play, main, '2029-03-10T19:30:00Z')
    const dance = await show('An Offered Dance', { category: 'dance', seasonId: hidden.id })
    await date(dance, main, '2029-05-10T19:30:00Z')

    const { status, body } = await req('GET', '/api/public-site/whats-on-filters', undefined, undefined)
    expect(status).toBe(200)
    // In the vocabulary's order, whatever order the shows come in.
    const categories = body.categories.map((c: { slug: string }) => c.slug)
    expect(categories.indexOf('play')).toBeLessThan(categories.indexOf('dance'))
    const seasons = body.seasons.map((s: { slug: string }) => s.slug)
    expect(seasons).toContain(spring.slug)
    expect(seasons).not.toContain(hidden.slug)
    const venues = body.venues.map((v: { name: string }) => v.name)
    expect(venues).toContain('The Offer House')
    expect(venues).not.toContain('An Empty Hall')
    expect(body.months).toEqual(expect.arrayContaining(['2029-03', '2029-05']))
    expect(body.months).toEqual([...body.months].sort())
  })
})
