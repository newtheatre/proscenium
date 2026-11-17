// What the site-readiness screen learns from the core (C-42, C-48, part 2's migration lines): brand
// items not yet given, public images with no text description, venues with no access recorded, and
// productions the content warnings migration left unfinished. Each item goes once it is put right.
import { describe, expect, it } from 'vitest'
import createProduction from '../../../core/server/api/core/productions/index.post'
import patchProduction from '../../../core/server/api/core/productions/[id]/index.patch'
import publishProduction from '../../../core/server/api/core/productions/[id]/publish.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import venueAccess from '../../../core/server/api/core/venues/[id]/access.put'
import { changeSetting, createUnit } from '#kit'
import { coreReadiness } from '#modules/core'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'PATCH /api/core/productions/:id': patchProduction,
  'POST /api/core/productions/:id/publish': publishProduction,
  'POST /api/core/venues': createVenue,
  'PUT /api/core/venues/:id/access': venueAccess,
})
const admin = person(['core.production.create', 'core.production.edit', 'core.production.publish', 'core.venue.manage'])

async function ok(method: string, path: string, body: object) {
  const r = await call(handle, method, path, { actor: admin, body })
  const json = await r.json() as any
  expect(r.status, JSON.stringify(json)).toBe(200)
  return json
}
const term = async (vocabulary: string, slug?: string) =>
  (await rows<{ id: string }>(`SELECT id FROM core_terms WHERE vocabulary_key = ?${slug ? ' AND slug = ?' : ''} ORDER BY id`, vocabulary, ...(slug ? [slug] : [])))[0]!.id
const readiness = () => inContext(() => coreReadiness())
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})
async function published(title: string): Promise<string> {
  const { id } = await ok('POST', '/api/core/productions', { title, kind: 'own' })
  await ok('PATCH', `/api/core/productions/${id}`, { summary: 'A show.', categoryTermId: await term('core.production-category', 'play'), effectsConfirmedNone: true, advisoriesConfirmedNone: true, externalBookingUrl: 'https://tickets.example/readiness' })
  await ok('POST', `/api/core/productions/${id}/publish`, {})
  return id
}

describe('site readiness, from the core', () => {
  it('asks for the theatre\'s name until it is set, and for a logo', async () => {
    expect((await readiness()).brand.map(b => b.item)).toEqual(['name', 'logo'])
    await setting('core.site.name', 'The Readiness Theatre')
    expect((await readiness()).brand).toEqual([{ item: 'logo', to: '/admin/branding' }])
  })

  it('lists a venue with no access recorded until a feature is recorded', async () => {
    const { venueId: id } = await ok('POST', '/api/core/venues', { name: 'The Bare Hall' })
    expect((await readiness()).venues).toContainEqual({ name: 'The Bare Hall', to: `/admin/modules/core/venues/${id}` })
    await ok('PUT', `/api/core/venues/${id}/access`, { spaceId: null, features: [{ termId: await term('core.place-access') }] })
    expect((await readiness()).venues.map(v => v.name)).not.toContain('The Bare Hall')
  })

  it('lists a published production whose public image has lost its description', async () => {
    const id = await published('The Undescribed')
    const image = (fileId: string, alt: string | null) => env.DB.prepare(
      `INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, sort, text_class, media_type, byte_size, sha256, access, state, alt_text, attached_at, created_at)
       VALUES (?, ?, 'core.production', ?, 'core.production-photos', 0, 'public', 'image/png', 10, 'x', 'public', 'ready', ?, ?, ?)`,
    ).bind(fileId, `k-${fileId}`, id, alt, Date.now(), Date.now()).run()
    await image('fil_described1', 'A stage')
    expect((await readiness()).images.map(i => i.name)).not.toContain('The Undescribed')
    await image('fil_undescribed1', '  ')
    expect((await readiness()).images).toContainEqual({ item: 'production', name: 'The Undescribed', to: `/console/programme/productions/${id}?tab=media` })
  })

  it('lists what the content warnings migration left: assumed levels and unanswered effects', async () => {
    const id = await published('The Migrated')
    await env.DB.prepare('INSERT INTO core_production_advisories (production_id, term_id, level, level_assumed) VALUES (?, ?, \'depicted\', 1)').bind(id, await term('core.advisory')).run()
    await env.DB.prepare('UPDATE core_productions SET effects_confirmed_none = 0 WHERE id = ?').bind(id).run()
    const r = await readiness()
    const to = `/console/programme/productions/${id}?tab=advisories`
    expect(r.levelsAssumed).toContainEqual({ name: 'The Migrated', to })
    expect(r.effectsUnanswered).toContainEqual({ name: 'The Migrated', to })
    const clean = await published('The Clean One')
    expect((await readiness()).effectsUnanswered.map(p => p.to)).not.toContain(`/console/programme/productions/${clean}?tab=advisories`)
  })
})
