// The public venue and season pages (part 6; C-47, C-48): a venue's public fields, its access features
// with their labels and icons, each performance space's finding-it note, what is on there, and
// "not found" once archived; a season's productions in the order they open, each marked past or
// current, and an archived season, or the past shows in one, hidden while past shows are not public.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedule from '../../../core/server/api/core/performances/[id]/schedule.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import patchVenue from '../../../core/server/api/core/venues/[id]/index.patch'
import venueAccess from '../../../core/server/api/core/venues/[id]/access.put'
import archiveVenue from '../../../core/server/api/core/venues/[id]/archive.post'
import addSpace from '../../../core/server/api/core/venues/[id]/spaces/index.post'
import createSeason from '../../../core/server/api/core/seasons/index.post'
import seasonState from '../../../core/server/api/core/seasons/[id]/state.post'
import readVenue from '../../server/api/public-site/venues/[slug].get'
import readSeason from '../../server/api/public-site/seasons/[slug].get'
import { changeSetting, createUnit } from '#kit'
import { publicProgrammePaths } from '#modules/core'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

// Nothing in these tests sells tickets, so a production needs a booking link to publish (Matt, 2026-11-17).
const BOOKING = 'https://tickets.example/book'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/venues': createVenue,
  'PATCH /api/core/venues/:id': patchVenue,
  'PUT /api/core/venues/:id/access': venueAccess,
  'POST /api/core/venues/:id/archive': archiveVenue,
  'POST /api/core/venues/:id/spaces': addSpace,
  'POST /api/core/seasons': createSeason,
  'POST /api/core/seasons/:id/state': seasonState,
  'GET /api/public-site/venues/:slug': readVenue,
  'GET /api/public-site/seasons/:slug': readSeason,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.venue.manage', 'core.season.manage'])

async function req<T = any>(method: string, path: string, body?: object, actor: ReturnType<typeof person> | undefined = admin): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
const visit = (path: string) => req('GET', path, undefined, undefined)
const term = async (vocabulary: string, slug: string) =>
  (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const slugOf = async (table: string, id: string) => (await rows<{ slug: string }>(`SELECT slug FROM ${table} WHERE id = ?`, id))[0]!.slug
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})
async function ok(method: string, path: string, body: object) {
  const r = await req(method, path, body)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
async function show(title: string, seasonId: string | null = null): Promise<string> {
  const { id } = await ok('POST', '/api/core/productions', { title, kind: 'own' })
  await ok('PATCH', `/api/core/productions/${id}`, { summary: 'A show.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: BOOKING, seasonId })
  await ok('POST', `/api/core/productions/${id}/publish`, {})
  return id
}
async function date(productionId: string, at: { venueId: string, spaceId: string }, startsAt: string) {
  const { id } = await ok('POST', `/api/core/productions/${productionId}/performances`, { venueId: at.venueId, spaceId: at.spaceId, startsAt: Date.parse(startsAt) })
  await ok('POST', `/api/core/performances/${id}/schedule`, {})
  return id
}

async function seasonWithShows() {
  const at = await ok('POST', '/api/core/venues', { name: `Season House ${Math.random()}` })
  const { id } = await ok('POST', '/api/core/seasons', { name: `Season ${Math.random()}`, startsOn: '2030-01-01', endsOn: '2030-12-31' })
  await ok('POST', `/api/core/seasons/${id}/state`, { to: 'published' })
  const later = await show('The Later One', id)
  await date(later, at, '2030-09-01T18:30:00Z')
  const sooner = await show('The Sooner One', id)
  await date(sooner, at, '2030-03-01T19:30:00Z')
  const undated = await show('The Undated One', id)
  const past = await show('The Past One', id)
  const done = await date(past, at, '2099-01-01T19:30:00Z')
  await env.DB.prepare('UPDATE core_performances SET starts_at = ?, doors_at = NULL, ends_at = ?, state = \'completed\', completed_at = ? WHERE id = ?')
    .bind(Date.parse('2026-01-01T19:30:00Z'), Date.parse('2026-01-01T21:30:00Z'), Date.now(), done).run()
  await env.DB.prepare('UPDATE core_productions SET first_starts_at = ?, last_ends_at = ? WHERE id = ?').bind(Date.parse('2026-01-01T19:30:00Z'), Date.parse('2026-01-01T21:30:00Z'), past).run()
  return { id, slug: await slugOf('core_seasons', id), later, sooner, undated, past }
}

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setting('core.locale.time-zone', 'Europe/London')
})
afterEach(async () => {
  await env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'public-site.%'").run()
})

describe('a venue\'s public page', () => {
  it('shows the public fields, access features with labels and icons, and the performance spaces\' notes', async () => {
    const at = await ok('POST', '/api/core/venues', { name: 'The Riverside', addressLines: '1 River Walk\nSouth Bank', locality: 'Nottingham', postcode: 'NG1 1AA', country: 'GB', latitude: 52.95, longitude: -1.15, gettingHere: 'Ten minutes from the station.', accessInfo: 'Ring ahead for the lift.' })
    await ok('PATCH', `/api/core/venues/${at.venueId}`, { description: 'Our home by the river.' })
    const studio = (await ok('POST', `/api/core/venues/${at.venueId}/spaces`, { name: 'The Studio', kindTermId: await term('core.space-kind', 'studio'), findingIt: 'Up the stairs on the left.' })).id
    await ok('POST', `/api/core/venues/${at.venueId}/spaces`, { name: 'The Store', kindTermId: await term('core.space-kind', 'store'), performable: false, findingIt: 'Staff only.' })
    await ok('PUT', `/api/core/venues/${at.venueId}/access`, { spaceId: null, features: [{ termId: await term('core.place-access', 'step-free'), note: 'From the river side' }] })
    await ok('PUT', `/api/core/venues/${at.venueId}/access`, { spaceId: studio, features: [{ termId: await term('core.place-access', 'hearing-loop'), note: null }] })
    const play = await show('A Riverside Play')
    await date(play, { venueId: at.venueId, spaceId: studio }, '2030-05-01T18:30:00Z')

    const { status, body } = await visit(`/api/public-site/venues/${await slugOf('core_venues', at.venueId)}`)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.venue).toMatchObject({
      name: 'The Riverside',
      address: { lines: ['1 River Walk', 'South Bank'], locality: 'Nottingham', postcode: 'NG1 1AA', country: 'GB' },
      location: { latitude: 52.95, longitude: -1.15 },
      description: 'Our home by the river.',
      gettingHere: 'Ten minutes from the station.',
      accessInfo: 'Ring ahead for the lift.',
      access: [{ label: 'Step-free access', icon: 'i-lucide-accessibility', note: 'From the river side' }],
    })
    // The space made with the venue, and the studio; never the store.
    expect(body.venue.spaces.map((s: { name: string }) => s.name)).toEqual(['The Riverside', 'The Studio'])
    expect(body.venue.spaces[1]).toMatchObject({ findingIt: 'Up the stairs on the left.', access: [{ label: 'Hearing loop', icon: 'i-lucide-ear', note: null }] })
    expect(body.productions.map((p: { id: string }) => p.id)).toEqual([play])
    // No internal field reaches the public.
    expect(Object.keys(body.venue.spaces[1]).sort()).toEqual(['access', 'accessInfo', 'description', 'findingIt', 'id', 'name', 'slug'])
  })

  it('answers not found for an unknown or archived venue', async () => {
    expect((await visit('/api/public-site/venues/no-such-place')).status).toBe(404)
    const at = await ok('POST', '/api/core/venues', { name: 'The Old Hall' })
    const slug = await slugOf('core_venues', at.venueId)
    expect((await visit(`/api/public-site/venues/${slug}`)).status).toBe(200)
    await ok('POST', `/api/core/venues/${at.venueId}/archive`, {})
    expect((await visit(`/api/public-site/venues/${slug}`)).status).toBe(404)
  })
})

describe('a season\'s public page', () => {
  it('lists the productions in the order they open, the undated last, each marked past or current', async () => {
    const s = await seasonWithShows()
    const { status, body } = await visit(`/api/public-site/seasons/${s.slug}`)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ startsOn: '2030-01-01', endsOn: '2030-12-31', archived: false })
    expect(body.productions.map((p: { id: string }) => p.id)).toEqual([s.past, s.sooner, s.later, s.undated])
    expect(body.productions.map((p: { past: boolean }) => p.past)).toEqual([true, false, false, false])
    expect(body.productions[3]).toMatchObject({ firstStartsAt: null, lastEndsAt: null })
  })

  it('hides a draft season, and an archived one or the past shows in any while past shows are not public', async () => {
    const draft = await ok('POST', '/api/core/seasons', { name: 'A Draft Season', startsOn: '2030-01-01', endsOn: '2030-12-31' })
    expect((await visit(`/api/public-site/seasons/${await slugOf('core_seasons', draft.id)}`)).status).toBe(404)

    const s = await seasonWithShows()
    await setting('public-site.archive.public', false)
    const { body } = await visit(`/api/public-site/seasons/${s.slug}`)
    expect(body.productions.map((p: { id: string }) => p.id)).toEqual([s.sooner, s.later, s.undated])
    await ok('POST', `/api/core/seasons/${s.id}/state`, { to: 'archived' })
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).status).toBe(404)
    await setting('public-site.archive.public', true)
    expect((await visit(`/api/public-site/seasons/${s.slug}`)).body).toMatchObject({ archived: true })
  })
})

describe('the sitemap\'s programme addresses (C-47)', () => {
  const paths = (pastVisible: boolean) => inContext(() => publicProgrammePaths({ pastVisible }))

  it('lists each public production where its page lives, venues and seasons, and nothing private', async () => {
    const s = await seasonWithShows()
    const slug = (id: string) => slugOf('core_productions', id)
    const unlisted = await show('The Unlisted One')
    await ok('PATCH', `/api/core/productions/${unlisted}`, { listed: false })
    const draft = (await ok('POST', '/api/core/productions', { title: 'The Draft One', kind: 'own' })).id
    const hall = await ok('POST', '/api/core/venues', { name: `Closed Hall ${Math.random()}` })
    await ok('POST', `/api/core/venues/${hall.venueId}/archive`, {})

    const open = await paths(true)
    expect(open).toEqual(expect.arrayContaining([`/whats-on/${await slug(s.sooner)}`, `/whats-on/${await slug(s.later)}`, `/shows/${await slug(s.past)}`, `/seasons/${s.slug}`]))
    // A production with no dates has nothing to show yet; drafts, unlisted shows and closed venues never appear.
    for (const hidden of [`/whats-on/${await slug(s.undated)}`, `/whats-on/${await slug(unlisted)}`, `/whats-on/${await slug(draft)}`, `/venues/${await slugOf('core_venues', hall.venueId)}`])
      expect(open).not.toContain(hidden)

    await ok('POST', `/api/core/seasons/${s.id}/state`, { to: 'archived' })
    const closed = await paths(false)
    expect(closed).toContain(`/whats-on/${await slug(s.sooner)}`)
    expect(closed).not.toContain(`/shows/${await slug(s.past)}`)
    expect(closed).not.toContain(`/seasons/${s.slug}`)
    expect(await paths(true)).toContain(`/seasons/${s.slug}`)
  })
})
