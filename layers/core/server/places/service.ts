// Venues and spaces (part 2, group 2; C-16, C-17). A venue is a building or site; a space is a room
// or area inside it, where performances happen. Creating a venue creates one space of the same name
// in the same unit, so a single-room theatre never thinks about spaces. Venues and spaces are
// archived, never deleted while anything uses them; the last space of a venue cannot be deleted.
// The guards that need performances (archive while a future one is scheduled, delete only if never
// used) arrive with the programme slice, which adds the performances table.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse } from '#kit'
import type { UnitView } from '#kit'
import { assertTerm, ensureVocabularies } from '../vocabularies/service'
import { neverPerformedIn, noFuturePerformancesIn } from '../programme/performances'

export interface VenueInput {
  name: string
  addressLines?: string | null
  locality?: string | null
  postcode?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  accessInfo?: string | null
  gettingHere?: string | null
}

export interface SpaceInput {
  name: string
  kindTermId: string
  defaultCapacity?: number | null
  performable?: boolean
  exclusive?: boolean
  description?: string | null
  accessInfo?: string | null
  managed?: boolean
  findingIt?: string | null
}

export interface Space {
  id: string
  venueId: string
  slug: string
  name: string
  kindTermId: string
  defaultCapacity: number | null
  performable: boolean
  exclusive: boolean
  description: string | null
  accessInfo: string | null
  /** Whether the theatre runs this space (R-36). Core treats both alike; other modules may ask. */
  managed: boolean
  /** A short public note for finding the space, shown under the venue's directions. */
  findingIt: string | null
  archived: boolean
  sort: number
}

export interface Venue {
  id: string
  slug: string
  name: string
  addressLines: string | null
  locality: string | null
  postcode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  accessInfo: string | null
  gettingHere: string | null
  archived: boolean
}

export interface PlaceFeature { termId: string, note: string | null }

interface VenueRow { id: string, slug: string, name: string, address_lines: string | null, locality: string | null, postcode: string | null, country: string | null, latitude: number | null, longitude: number | null, description: string | null, access_info: string | null, getting_here: string | null, state: string }
interface SpaceRow { id: string, venue_id: string, slug: string, name: string, kind_term_id: string, default_capacity: number | null, performable: number, exclusive: number, description: string | null, access_info: string | null, managed: number, finding_it: string | null, state: string, sort: number }

const toVenue = (r: VenueRow): Venue => ({
  id: r.id, slug: r.slug, name: r.name, addressLines: r.address_lines, locality: r.locality, postcode: r.postcode,
  country: r.country, latitude: r.latitude, longitude: r.longitude, description: r.description, accessInfo: r.access_info, gettingHere: r.getting_here, archived: r.state === 'archived',
})
const toSpace = (r: SpaceRow): Space => ({
  id: r.id, venueId: r.venue_id, slug: r.slug, name: r.name, kindTermId: r.kind_term_id, defaultCapacity: r.default_capacity,
  performable: !!r.performable, exclusive: !!r.exclusive, description: r.description, accessInfo: r.access_info, managed: !!r.managed, findingIt: r.finding_it,
  archived: r.state === 'archived', sort: r.sort,
})

const VENUE_NAME_TAKEN = { code: 'core.venue.name-taken', reason: 'Another venue has that name.', remedy: 'Choose a different name.' }
const SPACE_NAME_TAKEN = { code: 'core.space.name-taken', reason: 'Another space in this venue has that name.', remedy: 'Choose a different name.' }
const KIND_REFUSED = { code: 'core.space.kind-unknown', reason: 'Choose a kind of space from the list.' }
const FUTURE_PERFORMANCES = { code: 'core.place.in-use', reason: 'A scheduled performance still to come uses it.', remedy: 'Move or cancel those performances first.' }
const PERFORMED = { code: 'core.space.performed', reason: 'This space has had performances, so it is kept for their history.', remedy: 'Archive it instead.' }

function slugFrom(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'place' // not-policy: a slug's pattern and length
}

/** The first free slug from `base` among those taken: base, base-2, base-3... */
function freeSlug(base: string, taken: Set<string>): string {
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

async function venueSlug(name: string): Promise<string> {
  const base = slugFrom(name)
  return freeSlug(base, new Set((await all<{ slug: string }>('SELECT slug FROM core_venues WHERE slug = ? OR slug LIKE ?', base, `${base}-%`)).map(r => r.slug)))
}

async function spaceSlug(venueId: string, name: string): Promise<string> {
  const base = slugFrom(name)
  return freeSlug(base, new Set((await all<{ slug: string }>('SELECT slug FROM core_spaces WHERE venue_id = ? AND (slug = ? OR slug LIKE ?)', venueId, base, `${base}-%`)).map(r => r.slug)))
}

/** The kind a venue's first space gets: Auditorium, or the first live kind if that was retired. */
async function firstSpaceKind(): Promise<string> {
  await ensureVocabularies()
  const row = await first<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND retired_at IS NULL ORDER BY slug = 'auditorium' DESC, sort LIMIT 1")
  if (!row) refuse('core.space.no-kinds', 'There are no kinds of space to choose from.', { status: 409, remedy: 'Add a kind of space in Vocabularies.' })
  return row.id
}

function venueValues(input: Partial<VenueInput>, base?: VenueRow) {
  const pick = <K extends keyof VenueInput>(key: K, column: keyof VenueRow) => (input[key] === undefined ? (base ? base[column] : null) : input[key])
  return {
    name: input.name ?? base!.name,
    addressLines: pick('addressLines', 'address_lines'),
    locality: pick('locality', 'locality'),
    postcode: pick('postcode', 'postcode'),
    country: pick('country', 'country'),
    latitude: pick('latitude', 'latitude'),
    longitude: pick('longitude', 'longitude'),
    description: pick('description', 'description'),
    accessInfo: pick('accessInfo', 'access_info'),
    gettingHere: pick('gettingHere', 'getting_here'),
  }
}

async function venueRow(id: string): Promise<VenueRow> {
  const row = await first<VenueRow>('SELECT * FROM core_venues WHERE id = ?', id)
  if (!row) refuse('core.venue.not-found', 'There is no such venue.', { status: 404 })
  return row
}

async function spaceRow(venueId: string, id: string): Promise<SpaceRow> {
  const row = await first<SpaceRow>('SELECT * FROM core_spaces WHERE id = ? AND venue_id = ?', id, venueId)
  if (!row) refuse('core.space.not-found', 'There is no such space in this venue.', { status: 404 })
  return row
}

export async function listVenues(options: { archived?: boolean } = {}): Promise<(Venue & { spaces: Space[] })[]> {
  const venues = await all<VenueRow>(`SELECT * FROM core_venues ${options.archived ? '' : "WHERE state = 'active'"} ORDER BY lower(name)`)
  const spaces = await all<SpaceRow>('SELECT * FROM core_spaces ORDER BY sort, lower(name)')
  return venues.map(v => ({ ...toVenue(v), spaces: spaces.filter(s => s.venue_id === v.id).map(toSpace) }))
}

export async function getVenue(id: string): Promise<Venue & { spaces: Space[], access: (PlaceFeature & { spaceId: string | null })[] }> {
  const venue = toVenue(await venueRow(id))
  const spaces = (await all<SpaceRow>('SELECT * FROM core_spaces WHERE venue_id = ? ORDER BY sort, lower(name)', id)).map(toSpace)
  const access = (await all<{ space_id: string | null, term_id: string, note: string | null }>('SELECT space_id, term_id, note FROM core_place_access WHERE venue_id = ? ORDER BY space_id IS NOT NULL, space_id, sort', id))
    .map(r => ({ spaceId: r.space_id, termId: r.term_id, note: r.note }))
  return { ...venue, spaces, access }
}

/** Adds a venue and its first space, named after it (C-16). */
export async function createVenue(unit: UnitView, input: VenueInput): Promise<{ venueId: string, spaceId: string }> {
  const venueId = newId('ven')
  const spaceId = newId('spc')
  const v = venueValues(input)
  const at = nowMs()
  unit.add(sql`INSERT INTO core_venues (id, slug, name, address_lines, locality, postcode, country, latitude, longitude, description, access_info, getting_here, state, created_at)
    SELECT ${venueId}, ${await venueSlug(v.name)}, ${v.name}, ${v.addressLines}, ${v.locality}, ${v.postcode}, ${v.country}, ${v.latitude}, ${v.longitude}, ${v.description}, ${v.accessInfo}, ${v.gettingHere}, 'active', ${at}
    WHERE NOT EXISTS (SELECT 1 FROM core_venues WHERE lower(name) = lower(${v.name}))`).expect(1, VENUE_NAME_TAKEN)
  // The first space is one the theatre runs; a space in someone else's building is marked on the space.
  unit.add(sql`INSERT INTO core_spaces (id, venue_id, slug, name, kind_term_id, performable, exclusive, managed, state, sort, created_at)
    VALUES (${spaceId}, ${venueId}, ${slugFrom(v.name)}, ${v.name}, ${await firstSpaceKind()}, 1, 1, 1, 'active', 0, ${at})`)
  unit.audit({ action: 'create', record: ['core.venue', venueId] })
  return { venueId, spaceId }
}

export async function updateVenue(unit: UnitView, id: string, input: Partial<VenueInput>): Promise<void> {
  const row = await venueRow(id)
  const v = venueValues(input, row)
  unit.add(sql`UPDATE core_venues SET name = ${v.name}, address_lines = ${v.addressLines}, locality = ${v.locality}, postcode = ${v.postcode},
    country = ${v.country}, latitude = ${v.latitude}, longitude = ${v.longitude}, description = ${v.description}, access_info = ${v.accessInfo}, getting_here = ${v.gettingHere}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM core_venues WHERE lower(name) = lower(${v.name}) AND id != ${id})`).expect(1, VENUE_NAME_TAKEN)
  unit.audit({ action: 'update', record: ['core.venue', id] })
}

export async function setVenueArchived(unit: UnitView, id: string, archived: boolean): Promise<void> {
  const row = await venueRow(id)
  if ((row.state === 'archived') === archived) return
  // A venue with a scheduled performance still to come stays in use (part 3).
  unit.add(sql`UPDATE core_venues SET state = ${archived ? 'archived' : 'active'} WHERE id = ${id}${archived ? sql` AND ${noFuturePerformancesIn('venue_id', id)}` : sql``}`)
    .expect(1, FUTURE_PERFORMANCES)
  unit.audit({ action: 'state', record: ['core.venue', id], detail: { archived } })
  if (archived) unit.announce('core.venue.archived', { venueId: id }, { record: ['core.venue', id] })
}

export async function addSpace(unit: UnitView, venueId: string, input: SpaceInput): Promise<string> {
  await venueRow(venueId)
  if (await first('SELECT 1 FROM core_spaces WHERE venue_id = ? AND lower(name) = lower(?)', venueId, input.name)) refuse(SPACE_NAME_TAKEN.code, SPACE_NAME_TAKEN.reason, { remedy: SPACE_NAME_TAKEN.remedy })
  const id = newId('spc')
  const next = await first<{ sort: number }>('SELECT coalesce(max(sort), -1) + 1 AS sort FROM core_spaces WHERE venue_id = ?', venueId)
  unit.add(sql`INSERT INTO core_spaces (id, venue_id, slug, name, kind_term_id, default_capacity, performable, exclusive, description, access_info, managed, finding_it, state, sort, created_at)
    SELECT ${id}, ${venueId}, ${await spaceSlug(venueId, input.name)}, ${input.name}, ${input.kindTermId}, ${input.defaultCapacity ?? null}, ${input.performable === false ? 0 : 1}, ${input.exclusive === false ? 0 : 1},
      ${input.description ?? null}, ${input.accessInfo ?? null}, ${input.managed === false ? 0 : 1}, ${input.findingIt ?? null}, 'active', ${next?.sort ?? 0}, ${nowMs()}
    WHERE ${assertTerm(input.kindTermId, 'core.space-kind')}`).expect(1, KIND_REFUSED)
  unit.audit({ action: 'create', record: ['core.space', id], detail: { venueId } })
  return id
}

export async function updateSpace(unit: UnitView, venueId: string, id: string, input: Partial<SpaceInput>): Promise<void> {
  const row = await spaceRow(venueId, id)
  const name = input.name ?? row.name
  const kind = input.kindTermId ?? row.kind_term_id
  const pick = <T>(value: T | undefined, current: T) => (value === undefined ? current : value)
  if (await first('SELECT 1 FROM core_spaces WHERE venue_id = ? AND lower(name) = lower(?) AND id != ?', venueId, name, id)) refuse(SPACE_NAME_TAKEN.code, SPACE_NAME_TAKEN.reason, { remedy: SPACE_NAME_TAKEN.remedy })
  // A changed kind must be a live term; an unchanged one may since have been retired.
  const kindGuard = kind === row.kind_term_id ? sql`1` : assertTerm(kind, 'core.space-kind')
  unit.add(sql`UPDATE core_spaces SET name = ${name}, kind_term_id = ${kind}, default_capacity = ${pick(input.defaultCapacity, row.default_capacity)},
    performable = ${pick(input.performable, !!row.performable) ? 1 : 0}, exclusive = ${pick(input.exclusive, !!row.exclusive) ? 1 : 0},
    description = ${pick(input.description, row.description)}, access_info = ${pick(input.accessInfo, row.access_info)},
    managed = ${pick(input.managed, !!row.managed) ? 1 : 0}, finding_it = ${pick(input.findingIt, row.finding_it)}
    WHERE id = ${id} AND ${kindGuard}`).expect(1, KIND_REFUSED)
  unit.audit({ action: 'update', record: ['core.space', id], detail: { venueId } })
  // Other modules may care who runs a space (a bar, a hire), so a change is announced (R-36).
  if (input.managed !== undefined && input.managed !== !!row.managed)
    unit.announce('core.space.managed-changed', { spaceId: id, venueId, managed: input.managed }, { record: ['core.space', id] })
}

export async function setSpaceArchived(unit: UnitView, venueId: string, id: string, archived: boolean): Promise<void> {
  const row = await spaceRow(venueId, id)
  if ((row.state === 'archived') === archived) return
  unit.add(sql`UPDATE core_spaces SET state = ${archived ? 'archived' : 'active'} WHERE id = ${id}${archived ? sql` AND ${noFuturePerformancesIn('space_id', id)}` : sql``}`)
    .expect(1, FUTURE_PERFORMANCES)
  unit.audit({ action: 'state', record: ['core.space', id], detail: { archived, venueId } })
  if (archived) unit.announce('core.space.archived', { spaceId: id, venueId }, { record: ['core.space', id] })
}

/** Deletes a space, never the venue's last one (C-17). */
export async function deleteSpace(unit: UnitView, venueId: string, id: string): Promise<void> {
  await spaceRow(venueId, id)
  // A space that has ever had a performance is kept for its history (part 3).
  if (await first('SELECT 1 FROM core_performances WHERE space_id = ? LIMIT 1', id)) refuse(PERFORMED.code, PERFORMED.reason, { remedy: PERFORMED.remedy })
  unit.add(sql`DELETE FROM core_spaces WHERE id = ${id} AND venue_id = ${venueId} AND (SELECT count(*) FROM core_spaces WHERE venue_id = ${venueId}) > 1 AND ${neverPerformedIn('space_id', id)}`)
    .expect(1, { code: 'core.space.last', reason: 'A venue needs at least one space, so its last space cannot be deleted.', remedy: 'Rename it, or archive the venue.' })
  unit.audit({ action: 'delete', record: ['core.space', id], detail: { venueId } })
}

/**
 * Replaces the access features of a venue (spaceId null) or one of its spaces with the list given,
 * in that order. Each feature is a live term of core.place-access, with an optional short note.
 */
export async function setPlaceAccess(unit: UnitView, venueId: string, spaceId: string | null, features: PlaceFeature[]): Promise<void> {
  await venueRow(venueId)
  if (spaceId) await spaceRow(venueId, spaceId)
  if (new Set(features.map(f => f.termId)).size !== features.length) refuse('core.place-access.repeated', 'Each feature can be listed once.', { status: 422 })
  unit.add(sql`DELETE FROM core_place_access WHERE venue_id = ${venueId} AND space_id IS ${spaceId}`)
  features.forEach((f, sort) => {
    unit.add(sql`INSERT INTO core_place_access (id, venue_id, space_id, term_id, note, sort)
      SELECT ${newId('pla')}, ${venueId}, ${spaceId}, ${f.termId}, ${f.note}, ${sort} WHERE ${assertTerm(f.termId, 'core.place-access')}`)
      .expect(1, { code: 'core.place-access.unknown', reason: 'Choose access features from the list.' })
  })
  unit.audit({ action: 'update', record: spaceId ? ['core.space', spaceId] : ['core.venue', venueId], detail: { access: features.length } })
}

/** One space, or null. */
export async function getSpace(id: string): Promise<Space | null> {
  const row = await first<SpaceRow>('SELECT * FROM core_spaces WHERE id = ?', id)
  return row ? toSpace(row) : null
}

/** Spaces, narrowed by venue, by whether the theatre runs them and by whether they take performances. */
export async function listSpaces(query: { venueId?: string, managed?: boolean, performable?: boolean, archived?: boolean } = {}): Promise<Space[]> {
  const where: string[] = []
  const params: unknown[] = []
  const add = (clause: string, value: unknown) => {
    where.push(clause)
    params.push(value)
  }
  if (query.venueId !== undefined) add('venue_id = ?', query.venueId)
  if (query.managed !== undefined) add('managed = ?', query.managed ? 1 : 0)
  if (query.performable !== undefined) add('performable = ?', query.performable ? 1 : 0)
  if (!query.archived) where.push("state = 'active'")
  const rows = await all<SpaceRow>(`SELECT * FROM core_spaces ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY venue_id, sort, lower(name)`, ...params)
  return rows.map(toSpace)
}

/**
 * A place as a person reads it: "space, venue", such as "Studio, Portland Building". A venue's
 * only space that shares its name reads as the venue alone. Null for a space that does not exist.
 */
export async function placeName(spaceId: string): Promise<string | null> {
  const row = await first<{ space: string, venue: string }>('SELECT s.name AS space, v.name AS venue FROM core_spaces s JOIN core_venues v ON v.id = s.venue_id WHERE s.id = ?', spaceId)
  if (!row) return null
  return row.space.toLowerCase() === row.venue.toLowerCase() ? row.venue : `${row.space}, ${row.venue}`
}

/** A statement predicate, like assertSpaceFree: true while the space is active and the theatre runs it. */
export function assertSpaceManaged(spaceId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM core_spaces WHERE id = ${spaceId} AND state = 'active' AND managed = 1)`
}
