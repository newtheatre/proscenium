// C-16 and C-17: venues and spaces. A new venue brings one space of the same name; names are unique
// (a venue's among venues, a space's within its venue); the last space cannot be deleted; archiving
// announces; access features are live terms of core.place-access, set per venue or per space.
import { beforeEach, describe, expect, it } from 'vitest'
import listVenues from '../../server/api/core/venues/index.get'
import createVenue from '../../server/api/core/venues/index.post'
import getVenue from '../../server/api/core/venues/[id]/index.get'
import patchVenue from '../../server/api/core/venues/[id]/index.patch'
import archiveVenue from '../../server/api/core/venues/[id]/archive.post'
import restoreVenue from '../../server/api/core/venues/[id]/restore.post'
import setAccess from '../../server/api/core/venues/[id]/access.put'
import addSpace from '../../server/api/core/venues/[id]/spaces/index.post'
import patchSpace from '../../server/api/core/venues/[id]/spaces/[space]/index.patch'
import deleteSpace from '../../server/api/core/venues/[id]/spaces/[space]/index.delete'
import archiveSpace from '../../server/api/core/venues/[id]/spaces/[space]/archive.post'
import spaceImpact from '../../server/api/core/venues/[id]/spaces/[space]/impact.get'
import { assertSpaceManaged, getSpace, listSpaces, placeName } from '../../server/places/service'
import { sql } from 'drizzle-orm'
import { useDb } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/venues': listVenues,
  'POST /api/core/venues': createVenue,
  'GET /api/core/venues/:id': getVenue,
  'PATCH /api/core/venues/:id': patchVenue,
  'POST /api/core/venues/:id/archive': archiveVenue,
  'POST /api/core/venues/:id/restore': restoreVenue,
  'PUT /api/core/venues/:id/access': setAccess,
  'POST /api/core/venues/:id/spaces': addSpace,
  'PATCH /api/core/venues/:id/spaces/:space': patchSpace,
  'DELETE /api/core/venues/:id/spaces/:space': deleteSpace,
  'POST /api/core/venues/:id/spaces/:space/archive': archiveSpace,
  'GET /api/core/venues/:id/spaces/:space/impact': spaceImpact,
})
const admin = person(['core.venue.manage'])
const member = person([])

interface Option { id: string, label: string, retired: boolean }
interface VenueBody { venue: { id: string, slug: string, name: string, archived: boolean, spaces: { id: string, slug: string, name: string, kindTermId: string, archived: boolean }[], access: { spaceId: string | null, termId: string, note: string | null }[] }, kinds: Option[], features: Option[] }

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}

let n = 0
async function venue(name = `Venue ${++n}`): Promise<{ venueId: string, spaceId: string }> {
  const { status, body } = await json(call(handle, 'POST', '/api/core/venues', { actor: admin, body: { name } }))
  expect(status).toBe(200)
  return body
}
const read = async (id: string) => (await json<VenueBody>(call(handle, 'GET', `/api/core/venues/${id}`, { actor: admin }))).body

beforeEach(() => {
  resetRateLimits()
})

describe('venues', () => {
  it('come with one space of the same name, an auditorium', async () => {
    const { venueId, spaceId } = await venue('The Playhouse')
    const { venue: v, kinds } = await read(venueId)
    expect(v).toMatchObject({ name: 'The Playhouse', slug: 'the-playhouse', archived: false })
    expect(v.spaces).toHaveLength(1)
    expect(v.spaces[0]).toMatchObject({ id: spaceId, name: 'The Playhouse', slug: 'the-playhouse' })
    expect(kinds.find(k => k.id === v.spaces[0]!.kindTermId)?.label).toBe('Auditorium')
    expect(await rows('SELECT action FROM core_audit WHERE record_type = ? AND record_id = ?', 'core.venue', venueId)).toEqual([{ action: 'create' }])
  })

  it('need the ability, and a grant on one venue reaches that venue only', async () => {
    const { venueId } = await venue()
    const other = await venue()
    expect((await call(handle, 'GET', '/api/core/venues', { actor: member })).status).toBe(403)
    expect((await call(handle, 'POST', '/api/core/venues', { actor: member, body: { name: 'Nope' } })).status).toBe(403)
    const manager = person([], { grants: [{ ability: 'core.venue.manage', via: 'grant', record: { type: 'core.venue', id: venueId } }] } as any)
    expect((await call(handle, 'PATCH', `/api/core/venues/${venueId}`, { actor: manager, body: { locality: 'Nottingham' } })).status).toBe(200)
    expect((await call(handle, 'PATCH', `/api/core/venues/${other.venueId}`, { actor: manager, body: { locality: 'Derby' } })).status).toBe(403)
    expect((await call(handle, 'POST', '/api/core/venues', { actor: manager, body: { name: 'Site-wide only' } })).status).toBe(403)
  })

  it('refuse a name another venue has, in any case, and slug the rest apart', async () => {
    await venue('Lakeside Arts')
    const refused = await json(call(handle, 'POST', '/api/core/venues', { actor: admin, body: { name: 'lakeside arts' } }))
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.venue.name-taken')
    const again = await venue('Lakeside Arts!')
    expect((await read(again.venueId)).venue.slug).toBe('lakeside-arts-2')
  })

  it('take an address and a position only as a pair', async () => {
    const { venueId } = await venue()
    expect((await call(handle, 'PATCH', `/api/core/venues/${venueId}`, { actor: admin, body: { latitude: 52.9 } })).status).toBe(422)
    expect((await call(handle, 'PATCH', `/api/core/venues/${venueId}`, { actor: admin, body: { latitude: 52.9, longitude: -1.2, country: 'GB', postcode: 'NG7 2RD' } })).status).toBe(200)
    const [row] = await rows<{ latitude: number, country: string }>('SELECT latitude, country FROM core_venues WHERE id = ?', venueId)
    expect(row).toMatchObject({ latitude: 52.9, country: 'GB' })
  })

  it('announce when archived, leave the list, and come back when restored', async () => {
    const { venueId } = await venue('Old Barn')
    expect((await call(handle, 'POST', `/api/core/venues/${venueId}/archive`, { actor: admin, body: {} })).status).toBe(200)
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.venue.archived', venueId)).toHaveLength(1)
    const listed = async (state?: string) => (await json(call(handle, 'GET', `/api/core/venues?size=100${state ? `&state=${state}` : ''}`, { actor: admin }))).body.rows.map((v: { id: string }) => v.id)
    expect(await listed()).not.toContain(venueId)
    expect(await listed('archived')).toContain(venueId)
    expect((await call(handle, 'POST', `/api/core/venues/${venueId}/restore`, { actor: admin, body: {} })).status).toBe(200)
    expect(await listed()).toContain(venueId)
  })
})

describe('spaces', () => {
  it('are added with a live kind, named uniquely within the venue', async () => {
    const { venueId } = await venue()
    const { kinds } = await read(venueId)
    const studio = kinds.find(k => k.label === 'Studio')!
    const added = await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: studio.id, defaultCapacity: 60 } }))
    expect(added.status).toBe(200)
    const taken = await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'studio', kindTermId: studio.id } }))
    expect(taken.body.code).toBe('core.space.name-taken')
    const badKind = await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'Bar', kindTermId: 'trm_nope' } }))
    expect(badKind.body.code).toBe('core.space.kind-unknown')
    // The same name is fine in another venue.
    const other = await venue()
    expect((await call(handle, 'POST', `/api/core/venues/${other.venueId}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: studio.id } })).status).toBe(200)
  })

  it('cannot be reached through another venue', async () => {
    const a = await venue()
    const b = await venue()
    expect((await call(handle, 'PATCH', `/api/core/venues/${b.venueId}/spaces/${a.spaceId}`, { actor: admin, body: { name: 'Hijacked' } })).status).toBe(404)
  })

  it('never lose the last one, and are deleted while there are others', async () => {
    const { venueId, spaceId } = await venue()
    const last = await json(call(handle, 'DELETE', `/api/core/venues/${venueId}/spaces/${spaceId}`, { actor: admin }))
    expect(last.status).toBe(409)
    expect(last.body.code).toBe('core.space.last')
    const { kinds } = await read(venueId)
    const { body } = await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'Rehearsal room', kindTermId: kinds[0]!.id } }))
    expect((await call(handle, 'DELETE', `/api/core/venues/${venueId}/spaces/${body.id}`, { actor: admin })).status).toBe(200)
    expect((await read(venueId)).venue.spaces).toHaveLength(1)
  })

  it('announce when archived, and keep a kind that has since been retired', async () => {
    const { venueId, spaceId } = await venue()
    expect((await call(handle, 'POST', `/api/core/venues/${venueId}/spaces/${spaceId}/archive`, { actor: admin, body: {} })).status).toBe(200)
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.space.archived', spaceId)).toHaveLength(1)
    const kind = (await read(venueId)).venue.spaces[0]!.kindTermId
    await rows('UPDATE core_terms SET retired_at = 1 WHERE id = ?', kind)
    expect((await call(handle, 'PATCH', `/api/core/venues/${venueId}/spaces/${spaceId}`, { actor: admin, body: { name: 'Main house', kindTermId: kind } })).status).toBe(200)
    await rows('UPDATE core_terms SET retired_at = NULL WHERE id = ?', kind)
  })
})

describe('access features', () => {
  it('are set for the venue and for a space apart, in order, from live terms only', async () => {
    const { venueId, spaceId } = await venue()
    const { features } = await read(venueId)
    const [stepFree, loop, lift] = ['Step-free access', 'Hearing loop', 'Lift'].map(label => features.find(f => f.label === label)!.id)
    const put = (body: object) => json(call(handle, 'PUT', `/api/core/venues/${venueId}/access`, { actor: admin, body }))
    expect((await put({ features: [{ termId: stepFree, note: 'Via the side door' }, { termId: lift }] })).status).toBe(200)
    expect((await put({ spaceId, features: [{ termId: loop }] })).status).toBe(200)
    expect((await read(venueId)).venue.access).toEqual([
      { spaceId: null, termId: stepFree, note: 'Via the side door' },
      { spaceId: null, termId: lift, note: null },
      { spaceId, termId: loop, note: null },
    ])
    // Replacing the venue's list leaves the space's alone.
    expect((await put({ features: [{ termId: lift }] })).status).toBe(200)
    expect((await read(venueId)).venue.access.map(a => a.termId)).toEqual([lift, loop])

    const wrong = await put({ features: [{ termId: (await read(venueId)).kinds[0]!.id }] })
    expect(wrong.body.code).toBe('core.place-access.unknown')
    expect((await put({ features: [{ termId: lift }, { termId: lift }] })).body.code).toBe('core.place-access.repeated')
  })
})

describe('who runs a space (R-36)', () => {
  it('is set on each space, on by default, with a short note for finding it', async () => {
    const { venueId, spaceId } = await venue('Portland Building')
    const kind = (await read(venueId)).kinds[0]!.id
    const studio = await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: kind, managed: false, findingIt: 'Second floor, by the lifts' } }))
    expect(studio.status).toBe(200)
    expect(await inContext(() => getSpace(spaceId))).toMatchObject({ managed: true, findingIt: null })
    expect(await inContext(() => getSpace(studio.body.id))).toMatchObject({ managed: false, findingIt: 'Second floor, by the lifts' })
    expect((await inContext(() => listSpaces({ venueId, managed: false }))).map(s => s.name)).toEqual(['Studio'])
    // A note longer than 200 characters is refused, and the venue no longer takes an answer of its own.
    expect((await json(call(handle, 'PATCH', `/api/core/venues/${venueId}/spaces/${spaceId}`, { actor: admin, body: { findingIt: 'x'.repeat(201) } }))).status).toBe(422)
    await json(call(handle, 'PATCH', `/api/core/venues/${venueId}`, { actor: admin, body: { managed: false } }))
    expect(await inContext(() => getSpace(spaceId))).toMatchObject({ managed: true })
  })

  it('announces a change, and offers it to other modules before it is saved', async () => {
    const { venueId, spaceId } = await venue()
    const impact = await json(call(handle, 'GET', `/api/core/venues/${venueId}/spaces/${spaceId}/impact?managed=false`, { actor: admin }))
    expect(impact).toEqual({ status: 200, body: { lines: [] } })
    expect((await json(call(handle, 'PATCH', `/api/core/venues/${venueId}/spaces/${spaceId}`, { actor: admin, body: { managed: false } }))).status).toBe(200)
    // Saving the same answer again announces nothing more.
    await json(call(handle, 'PATCH', `/api/core/venues/${venueId}/spaces/${spaceId}`, { actor: admin, body: { managed: false, name: 'Renamed' } }))
    const events = await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'core.space.managed-changed' AND record_id = ?", spaceId)
    expect(events.map(e => JSON.parse(e.payload))).toEqual([{ spaceId, venueId, managed: false }])
  })

  it('names a place as space and venue, and answers whether the theatre runs it inside a statement', async () => {
    const { venueId, spaceId } = await venue('Trent Building')
    const kind = (await read(venueId)).kinds[0]!.id
    const studio = (await json(call(handle, 'POST', `/api/core/venues/${venueId}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: kind, managed: false } }))).body.id
    expect(await inContext(() => placeName(studio))).toBe('Studio, Trent Building')
    // The venue's own space, with its name, reads as the venue alone.
    expect(await inContext(() => placeName(spaceId))).toBe('Trent Building')
    const managed = (id: string) => inContext(async () => (await useDb().get<{ ok: number }>(sql`SELECT ${assertSpaceManaged(id)} AS ok`))!.ok)
    expect(await managed(spaceId)).toBe(1)
    expect(await managed(studio)).toBe(0)
  })
})
