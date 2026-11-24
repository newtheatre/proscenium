// What other modules add to the public site (C-69, C-71 to C-73, C-75), through the festive fixture:
// sections on production and venue pages only where they apply, billing lines trimmed and ordered,
// the front page, menu and footer while the condition holds, and production pages moved to a base.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedule from '../../../core/server/api/core/performances/[id]/schedule.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import readVenue from '../../server/api/public-site/venues/[slug].get'
import readProduction from '../../server/api/public-site/productions/[slug].get'
import readShape from '../../server/api/public-site/shape.get'
import { publicProgrammePaths } from '#modules/core'
import { resetRateLimits } from '#kit/ratelimit'
import { changeSetting, createUnit } from '#kit'
import { festive } from '../../../../tests/fixtures/modules/festive/server/state'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { productionBase } from '../../server/shape'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedule,
  'POST /api/core/venues': createVenue,
  'GET /api/public-site/venues/:slug': readVenue,
  'GET /api/public-site/productions/:slug': readProduction,
  'GET /api/public-site/shape': readShape,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.venue.manage'])

async function ok(method: string, path: string, body: object) {
  const r = await call(handle, method, path, { actor: admin, body })
  const json = await r.json() as any
  expect(r.status, JSON.stringify(json)).toBe(200)
  return json
}
async function visit(path: string) {
  const r = await call(handle, 'GET', path, {})
  return r.json() as Promise<any>
}
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})
const slugOf = async (table: string, id: string) => (await rows<{ slug: string }>(`SELECT slug FROM ${table} WHERE id = ?`, id))[0]!.slug

/** A published production with a date to come at a new venue. */
async function show() {
  const at = await ok('POST', '/api/core/venues', { name: `Festival House ${Math.random()}` })
  const { id } = await ok('POST', '/api/core/productions', { title: `Festival Show ${Math.random()}`, kind: 'own' })
  const [category] = await rows<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = \'core.production-category\' AND slug = \'play\'')
  await ok('PATCH', `/api/core/productions/${id}`, { summary: 'A show.', categoryTermId: category!.id, effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: 'https://tickets.example/book' })
  await ok('POST', `/api/core/productions/${id}/publish`, {})
  const date = await ok('POST', `/api/core/productions/${id}/performances`, { venueId: at.venueId, spaceId: at.spaceId, startsAt: Date.parse('2030-06-01T18:30:00Z') })
  await ok('POST', `/api/core/performances/${date.id}/schedule`, {})
  return { id, slug: await slugOf('core_productions', id), venueId: at.venueId as string, venueSlug: await slugOf('core_venues', at.venueId) }
}

beforeEach(async () => {
  resetRateLimits()
  await setModule('public-site', true)
  await setModule('festive', true)
  await setting('core.locale.time-zone', 'Europe/London')
  Object.assign(festive, { on: false, failing: false })
  festive.ids.clear()
})
afterEach(async () => {
  await setModule('festive', false)
})

describe('sections and billing lines', () => {
  it('draws a section and billing lines only on the pages they apply to, lines trimmed and in order', async () => {
    const a = await show()
    const b = await show()
    festive.ids.add(a.id)
    const page = await visit(`/api/public-site/productions/${a.slug}`)
    expect(page.sections).toEqual([{ id: 'festive.works', component: 'FestiveWorks' }])
    expect(page.lines).toEqual([
      { text: 'A festival premiere', placement: 'under-title', order: 1 },
      { text: 'By arrangement with Samuel French', placement: 'credits', order: 2 },
    ])
    const other = await visit(`/api/public-site/productions/${b.slug}`)
    expect([other.sections, other.lines]).toEqual([[], []])
  })

  it('draws a venue section where it applies, and none from a contributor that fails', async () => {
    const a = await show()
    festive.ids.add(a.venueId)
    expect((await visit(`/api/public-site/venues/${a.venueSlug}`)).sections).toEqual([{ id: 'festive.in-festival', component: 'FestiveInFestival' }])
    festive.failing = true
    expect((await visit(`/api/public-site/venues/${a.venueSlug}`)).sections).toEqual([])
  })

  it('adds nothing while the contributing module is off', async () => {
    const a = await show()
    festive.ids.add(a.id)
    await setModule('festive', false)
    const page = await visit(`/api/public-site/productions/${a.slug}`)
    expect([page.sections, page.lines, page.base]).toEqual([[], [], null])
  })
})

describe('the site\'s shape', () => {
  it('keeps the theatre\'s own site until the condition holds', async () => {
    expect(await visit('/api/public-site/shape')).toEqual({ frontPage: null, menu: [], footer: [], productionBase: null })
  })

  it('gives the front page, menu in order, footer and production address while it applies', async () => {
    festive.on = true
    expect(await visit('/api/public-site/shape')).toEqual({
      frontPage: 'FestiveFront',
      menu: [{ labelKey: 'festive.events', to: '/events', order: 1 }, { labelKey: 'festive.venues', to: '/venues', order: 2 }],
      footer: [{ labelKey: 'festive.about', to: '/about-the-festival', order: 0 }],
      productionBase: 'events',
    })
  })

  it('moves production pages and the sitemap\'s addresses to the base while it applies', async () => {
    const a = await show()
    festive.on = true
    expect((await visit(`/api/public-site/productions/${a.slug}`)).base).toBe('events')
    const paths = await inContext(async () => publicProgrammePaths({ productionBase: await productionBase() }))
    expect(paths).toContain(`/events/${a.slug}`)
    expect(paths).not.toContain(`/whats-on/${a.slug}`)
  })
})
