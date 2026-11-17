// The public programme read (part 4, routes; C-38, C-39, C-46, C-47): only published productions and
// their public dates, an old address pointing at the new one, past shows hidden while the archive is
// not public, and the booking action for each date from core.booking-action, then the external link.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import cancelProduction from '../../../core/server/api/core/productions/[id]/cancel.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedule from '../../../core/server/api/core/performances/[id]/schedule.post'
import cancelPerformance from '../../../core/server/api/core/performances/[id]/cancel.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import listProductions from '../../server/api/public-site/productions/index.get'
import readProduction from '../../server/api/public-site/productions/[slug].get'
import { changeSetting, createUnit } from '#kit'
import { useRegistry } from '#kit/registry'
import { resetRateLimits } from '#kit/ratelimit'
import type { BookingAction, BookingSubject } from '#modules/core'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/cancel': cancelProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/performances/:id/cancel': cancelPerformance,
  'POST /api/core/venues': createVenue,
  'GET /api/public-site/productions': listProductions,
  'GET /api/public-site/productions/:slug': readProduction,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.production.cancel', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage'])

async function req<T = any>(method: string, path: string, body?: object, actor: ReturnType<typeof person> | undefined = admin): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
const visit = (path: string) => req('GET', path, undefined, undefined)
const term = async (vocabulary: string, slug: string) =>
  (await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ? AND slug = ?', vocabulary, slug))[0]!.id
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})

let n = 0
let venue: { venueId: string, spaceId: string }
async function show(options: { publish?: boolean, listed?: boolean, link?: string } = {}): Promise<{ id: string, slug: string }> {
  const { body } = await req('POST', '/api/core/productions', { title: `Public show ${++n}`, kind: 'own' })
  await req('PATCH', `/api/core/productions/${body.id}`, {
    summary: 'A play.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true,
    listed: options.listed ?? true, externalBookingUrl: options.link ?? null,
  })
  if (options.publish ?? true) expect((await req('POST', `/api/core/productions/${body.id}/publish`, {})).status).toBe(200)
  return { id: body.id, slug: (await rows<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', body.id))[0]!.slug }
}
async function date(productionId: string, startsAt: string, options: { schedule?: boolean, link?: string } = {}): Promise<string> {
  const { status, body } = await req('POST', `/api/core/productions/${productionId}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.parse(startsAt), externalBookingUrl: options.link ?? null })
  expect(status, JSON.stringify(body)).toBe(200)
  if (options.schedule ?? true) expect((await req('POST', `/api/core/performances/${body.id}/schedule`, {})).status).toBe(200)
  return body.id
}
// Moves a performance into the past as the completing task would leave it.
const finish = (id: string) => env.DB.prepare('UPDATE core_performances SET starts_at = ?, doors_at = NULL, ends_at = ?, state = \'completed\', completed_at = ? WHERE id = ?')
  .bind(Date.parse('2026-01-10T19:30:00Z'), Date.parse('2026-01-10T21:30:00Z'), Date.now(), id).run()

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setting('core.locale.time-zone', 'Europe/London')
  if (!venue) venue = (await req('POST', '/api/core/venues', { name: 'The Playhouse' })).body
})
afterEach(async () => {
  await env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'public-site.%'").run()
})

describe('a production\'s public page', () => {
  it('shows a published production with its scheduled dates, and nothing in draft', async () => {
    const draft = await show({ publish: false })
    await date(draft.id, '2027-05-01T19:30:00Z', { schedule: false })
    expect((await visit(`/api/public-site/productions/${draft.slug}`)).status).toBe(404)

    const s = await show()
    const first = await date(s.id, '2027-05-02T19:30:00Z')
    await date(s.id, '2027-05-03T19:30:00Z', { schedule: false })
    const { status, body } = await visit(`/api/public-site/productions/${s.slug}`)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ id: s.id, slug: s.slug, summary: 'A play.', category: { slug: 'play' }, state: 'published', past: false, credits: [] })
    expect(body.performances.map((p: { id: string }) => p.id)).toEqual([first])
    expect(body.performances[0]).toMatchObject({ state: 'scheduled', venue: { name: 'The Playhouse' }, booking: null })
    // Internal fields stay out.
    expect(body).not.toHaveProperty('kind')
    expect(body).not.toHaveProperty('listed')
  })

  it('carries the poster and photos in use, with their descriptions, and nothing waiting or removed', async () => {
    const s = await show()
    const image = (id: string, slot: string, state: string, attached: boolean, sort = 0) => env.DB.prepare(
      `INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, sort, text_class, media_type, byte_size, sha256, access, state, alt_text, width, height, attached_at, created_at)
       VALUES (?, ?, 'core.production', ?, ?, ?, 'public', 'image/png', 10, 'x', 'public', ?, ?, 600, 900, ?, ?)`,
    ).bind(id, `k-${id}`, s.id, slot, sort, state, `Image ${id}`, attached ? Date.now() : null, Date.now()).run()
    await image(`fil_p${n}`, 'core.production-poster', 'ready', true)
    await image(`fil_a${n}`, 'core.production-photos', 'ready', true, 2)
    await image(`fil_b${n}`, 'core.production-photos', 'ready', true, 1)
    await image(`fil_w${n}`, 'core.production-photos', 'ready', false)
    await image(`fil_d${n}`, 'core.production-photos', 'deleted', true)
    await date(s.id, '2027-05-05T19:30:00Z')
    const { body } = await visit(`/api/public-site/productions/${s.slug}`)
    expect(body.poster).toEqual({ url: `/files/fil_p${n}`, alt: `Image fil_p${n}`, width: 600, height: 900 })
    expect(body.photos.map((p: { url: string }) => p.url)).toEqual([`/files/fil_b${n}`, `/files/fil_a${n}`])
    const listed = (await visit('/api/public-site/productions')).body.productions.find((p: { id: string }) => p.id === s.id)
    expect(listed.poster).toMatchObject({ url: `/files/fil_p${n}` })
  })

  it('points an old address at the current one', async () => {
    const s = await show()
    await req('PATCH', `/api/core/productions/${s.id}`, { slug: `${s.slug}-renamed` })
    expect((await visit(`/api/public-site/productions/${s.slug}`)).body).toEqual({ moved: `${s.slug}-renamed` })
  })

  it('keeps a cancelled date until it has passed, unless the theatre hides them', async () => {
    const s = await show()
    const kept = await date(s.id, '2027-06-01T19:30:00Z')
    const dropped = await date(s.id, '2027-06-02T19:30:00Z')
    expect((await req('POST', `/api/core/performances/${dropped}/cancel`, { reasonTermId: await term('core.cancel-reason', 'other') })).status).toBe(200)
    const shown = (await visit(`/api/public-site/productions/${s.slug}`)).body.performances
    expect(shown.map((p: { id: string, state: string }) => [p.id, p.state])).toEqual([[kept, 'scheduled'], [dropped, 'cancelled']])
    expect(shown[1].booking).toBeNull()

    await setting('public-site.listing.cancelled-visible', false)
    expect((await visit(`/api/public-site/productions/${s.slug}`)).body.performances.map((p: { id: string }) => p.id)).toEqual([kept])
  })

  it('hides a past show while past shows are not public, and leaves current ones alone (C-47)', async () => {
    const past = await show()
    await finish(await date(past.id, '2027-07-01T19:30:00Z'))
    const current = await show()
    await date(current.id, '2027-07-02T19:30:00Z')
    expect((await visit(`/api/public-site/productions/${past.slug}`)).body).toMatchObject({ past: true })

    await setting('public-site.archive.public', false)
    expect((await visit(`/api/public-site/productions/${past.slug}`)).status).toBe(404)
    expect((await visit(`/api/public-site/productions/${current.slug}`)).status).toBe(200)
  })

  it('answers not found while the public site is switched off', async () => {
    const s = await show()
    await setModule('public-site', false)
    expect((await visit(`/api/public-site/productions/${s.slug}`)).status).toBe(404)
    expect((await visit('/api/public-site/productions')).status).toBe(404)
  })
})

describe('the booking action for each date', () => {
  const asked: BookingSubject[][] = []
  let restore = () => {}
  const contribute = (action: BookingAction) => {
    const entry = useRegistry().modules.get('seats')!
    const before = { contributes: entry.manifest.contributes, handlers: entry.handlers.contributions }
    ;(entry.manifest as any).contributes = { ...before.contributes, 'core.booking-action': [{ id: 'seats.test', file: 'test' }] }
    ;(entry.handlers as any).contributions = { ...before.handlers, 'core.booking-action': { test: action } }
    restore = () => {
      ;(entry.manifest as any).contributes = before.contributes
      ;(entry.handlers as any).contributions = before.handlers
    }
  }
  afterEach(() => {
    restore()
    asked.length = 0
  })

  it('falls back to the date\'s own link, then the production\'s, and is absent with neither', async () => {
    const linked = await show({ link: 'https://tickets.example/show' })
    const own = await date(linked.id, '2027-08-01T19:30:00Z', { link: 'https://tickets.example/one-night' })
    const inherited = await date(linked.id, '2027-08-02T19:30:00Z')
    const performances = (await visit(`/api/public-site/productions/${linked.slug}`)).body.performances
    expect(performances.find((p: { id: string }) => p.id === own).booking).toEqual({ state: 'available', link: 'https://tickets.example/one-night', external: true })
    expect(performances.find((p: { id: string }) => p.id === inherited).booking).toEqual({ state: 'available', link: 'https://tickets.example/show', external: true })
  })

  it('takes a contribution\'s answer, asked once for every bookable date, and nothing for a past one', async () => {
    contribute({
      actions: async (subjects) => {
        asked.push(subjects)
        return Object.fromEntries(subjects.map((s, i) => [s.id, i === 0 ? { state: 'limited', link: `/book/${s.id}`, seatsLeft: 14 } : { state: 'sold-out', waitingList: `/book/${s.id}/wait` }]))
      },
    })
    const s = await show({ link: 'https://tickets.example/never-used' })
    const done = await date(s.id, '2027-09-01T19:30:00Z')
    await finish(done)
    const a = await date(s.id, '2027-09-02T19:30:00Z')
    const b = await date(s.id, '2027-09-03T19:30:00Z')
    const performances = (await visit(`/api/public-site/productions/${s.slug}`)).body.performances
    expect(asked).toHaveLength(1)
    expect(asked[0]!.map(x => x.id)).toEqual([a, b])
    expect(asked[0]![0]).toMatchObject({ productionId: s.id, startsAt: Date.parse('2027-09-02T19:30:00Z') })
    expect(Object.fromEntries(performances.map((p: { id: string, booking: unknown }) => [p.id, p.booking]))).toEqual({
      [done]: null,
      [a]: { state: 'limited', link: `/book/${a}`, seatsLeft: 14 },
      [b]: { state: 'sold-out', waitingList: `/book/${b}/wait` },
    })
  })

  it('asks nothing for a cancelled production', async () => {
    contribute({ actions: async (subjects) => {
      asked.push(subjects)
      return {}
    } })
    const s = await show()
    await date(s.id, '2027-10-01T19:30:00Z')
    expect((await req('POST', `/api/core/productions/${s.id}/cancel`, { reasonTermId: await term('core.cancel-reason', 'other') })).status).toBe(200)
    const { body } = await visit(`/api/public-site/productions/${s.slug}`)
    expect(body).toMatchObject({ state: 'cancelled', past: true })
    expect(asked).toHaveLength(0)
  })
})

describe('what\'s on (C-38)', () => {
  it('lists published, listed productions with a date to come, soonest first', async () => {
    await env.DB.prepare('UPDATE core_productions SET listed = 0').run()
    const later = await show()
    await date(later.id, '2028-02-10T19:30:00Z')
    const sooner = await show()
    await date(sooner.id, '2028-02-01T19:30:00Z')
    await date(sooner.id, '2028-02-03T19:30:00Z')
    const unlisted = await show({ listed: false })
    await date(unlisted.id, '2028-01-20T19:30:00Z')
    const undated = await show()
    const pastOnly = await show()
    await finish(await date(pastOnly.id, '2028-01-21T19:30:00Z'))
    const { status, body } = await visit('/api/public-site/productions')
    expect(status).toBe(200)
    expect(body.productions.map((p: { id: string }) => p.id)).toEqual([sooner.id, later.id])
    expect(body.productions[0]).toMatchObject({ nextStartsAt: Date.parse('2028-02-01T19:30:00Z'), lastEndsAt: Date.parse('2028-02-03T21:30:00Z'), venues: ['The Playhouse'] })
    expect(body.productions.map((p: { id: string }) => p.id)).not.toContain(undated.id)
  })
})
