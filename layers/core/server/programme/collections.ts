// Collections (C-60): strands of productions with a page of their own. A collection bound to a season
// takes only that season's productions (CL1), as a predicate on the insert; reads only choose refusals.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse } from '#kit'
import type { UnitView } from '#kit'
import { MINIMUM_CONTRAST, contrast, textOn } from '../../shared/colour'
import { slugFrom } from './service'
import { productionCards, type SeasonProduction } from './public-places'
import type { PublicImage } from './media'
import { fileUrl } from '../files/service'

export type CollectionState = 'draft' | 'published' | 'archived'

export interface Collection {
  id: string
  slug: string
  name: string
  summary: string | null
  description: string | null
  colour: string
  seasonId: string | null
  season: string | null
  state: CollectionState
  sort: number
  /** Every member, drafts included (CL3). */
  productions: number
}

export interface CollectionMember { id: string, title: string, state: string, seasonId: string | null, firstStartsAt: number | null, lastEndsAt: number | null, sort: number }

export interface CollectionInput {
  name: string
  slug?: string
  summary?: string | null
  description?: string | null
  colour: string
  seasonId?: string | null
}

export interface CollectionChip { id: string, slug: string, name: string, colour: string }

interface Row { id: string, slug: string, name: string, summary: string | null, description: string | null, colour: string, season_id: string | null, season: string | null, state: CollectionState, sort: number, productions: number }

const toCollection = (r: Row): Collection => ({
  id: r.id, slug: r.slug, name: r.name, summary: r.summary, description: r.description, colour: r.colour,
  seasonId: r.season_id, season: r.season, state: r.state, sort: r.sort, productions: r.productions ?? 0,
})
const SELECT = `SELECT c.*, s.name AS season, (SELECT count(*) FROM core_collection_productions m WHERE m.collection_id = c.id) AS productions
  FROM core_collections c LEFT JOIN core_seasons s ON s.id = c.season_id`
const record = (id: string): ['core.collection', string] => ['core.collection', id]
const COLOUR = /^#[0-9a-f]{6}$/ // not-policy: a colour code's shape
const NAME_TAKEN = { code: 'core.collection.name-taken', reason: 'Another collection has that name.', remedy: 'Choose a different name.' }
const CHANGED = { code: 'core.collection.changed', reason: 'Someone else changed this collection just now.', remedy: 'Refresh and try again.' }
const OTHER_SEASON = { code: 'core.collection.other-season', reason: 'This collection is for one season, and that production is in another.', remedy: 'Move the production to the collection\'s season first, or choose a collection for any season.' }

/** A colour chips and timetable blocks can carry text on: readable in white or near-black. */
function checkColour(colour: string): string {
  const hex = colour.toLowerCase()
  if (!COLOUR.test(hex)) refuse('core.collection.colour', 'Give a colour such as #1d4ed8.', { status: 422, fields: { colour: 'Give a colour such as #1d4ed8.' } })
  if (contrast(textOn(hex), hex) < MINIMUM_CONTRAST)
    refuse('core.collection.colour-contrast', 'Text on that colour would be hard to read.', { status: 422, fields: { colour: 'Choose a darker or lighter colour.' } })
  return hex
}

async function slugTaken(slug: string, except: string | null = null): Promise<boolean> {
  return !!await first(`SELECT 1 FROM core_collections WHERE slug = ? AND id IS NOT ?
    UNION ALL SELECT 1 FROM core_collection_slugs WHERE slug = ? AND collection_id IS NOT ?`, slug, except, slug, except)
}

async function freeSlug(base: string): Promise<string> {
  let slug = base
  for (let n = 2; await slugTaken(slug); n++) slug = `${base}-${n}`
  return slug
}

async function collectionRow(id: string): Promise<Row> {
  const row = await first<Row>(`${SELECT} WHERE c.id = ?`, id)
  if (!row) refuse('core.collection.not-found', 'There is no such collection.', { status: 404 })
  return row
}

/** Collections for the console, one season's or all, in season order then their own. */
export async function listCollections(query: { seasonId?: string, state?: CollectionState } = {}): Promise<Collection[]> {
  const rows = await all<Row>(`${SELECT} WHERE (? IS NULL OR c.season_id = ?) AND (? IS NULL OR c.state = ?)
    ORDER BY c.state = 'archived', s.starts_on IS NULL, s.starts_on DESC, c.sort, lower(c.name)`,
  query.seasonId ?? null, query.seasonId ?? null, query.state ?? null, query.state ?? null)
  return rows.map(toCollection)
}

export async function getCollection(id: string): Promise<Collection & { members: CollectionMember[] }> {
  const row = await collectionRow(id)
  const members = await all<CollectionMember>(`SELECT p.id, p.title, p.state, p.season_id AS seasonId, p.first_starts_at AS firstStartsAt, p.last_ends_at AS lastEndsAt, m.sort
    FROM core_collection_productions m JOIN core_productions p ON p.id = m.production_id WHERE m.collection_id = ? ORDER BY m.sort, p.id`, id)
  return { ...toCollection(row), members }
}

/** Each production's published collections, for chips (or every collection, for staff). Set-wise. */
export async function collectionsFor(productionIds: readonly string[], options: { publishedOnly?: boolean } = {}): Promise<Map<string, CollectionChip[]>> {
  const out = new Map<string, CollectionChip[]>(productionIds.map(id => [id, []]))
  if (!productionIds.length) return out
  const rows = await all<CollectionChip & { productionId: string }>(`SELECT m.production_id AS productionId, c.id, c.slug, c.name, c.colour
    FROM core_collection_productions m JOIN core_collections c ON c.id = m.collection_id
    WHERE m.production_id IN (SELECT value FROM json_each(?))${options.publishedOnly ? ' AND c.state = \'published\'' : ''}
    ORDER BY c.sort, lower(c.name)`, JSON.stringify([...new Set(productionIds)]))
  for (const { productionId, ...chip } of rows) out.get(productionId)?.push(chip)
  return out
}

export async function createCollection(unit: UnitView, input: CollectionInput, actorId: string | null): Promise<string> {
  const colour = checkColour(input.colour)
  const slug = input.slug ?? await freeSlug(slugFrom(input.name, 'collection'))
  if (input.slug && await slugTaken(input.slug)) refuse('core.collection.slug-taken', 'A collection has, or once had, that web address.', { status: 409, fields: { slug: 'Choose a different web address.' } })
  const id = newId('cln')
  const seasonId = input.seasonId ?? null
  unit.add(sql`INSERT INTO core_collections (id, slug, name, summary, description, colour, season_id, state, sort, created_by, created_at)
    SELECT ${id}, ${slug}, ${input.name}, ${input.summary ?? null}, ${input.description ?? null}, ${colour}, ${seasonId}, 'draft',
      (SELECT coalesce(max(sort), -1) + 1 FROM core_collections WHERE season_id IS ${seasonId}), ${actorId}, ${nowMs()}
    WHERE NOT EXISTS (SELECT 1 FROM core_collections WHERE lower(name) = lower(${input.name}))
      AND (${seasonId} IS NULL OR EXISTS (SELECT 1 FROM core_seasons WHERE id = ${seasonId}))`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: record(id) })
  return id
}

/**
 * Changes a collection's details. A new web address keeps the old one as a redirect once the
 * collection has been public. Binding it to a season is refused while a member is in another (CL1).
 */
export async function updateCollection(unit: UnitView, id: string, input: Partial<CollectionInput>): Promise<void> {
  const row = await collectionRow(id)
  const v = {
    name: input.name ?? row.name,
    summary: input.summary === undefined ? row.summary : input.summary,
    description: input.description === undefined ? row.description : input.description,
    colour: input.colour === undefined ? row.colour : checkColour(input.colour),
    seasonId: input.seasonId === undefined ? row.season_id : input.seasonId,
    slug: input.slug ?? row.slug,
  }
  const slugChanged = v.slug !== row.slug
  if (slugChanged && await slugTaken(v.slug, id)) refuse('core.collection.slug-taken', 'A collection has, or once had, that web address.', { status: 409, fields: { slug: 'Choose a different web address.' } })
  const outside = v.seasonId && v.seasonId !== row.season_id
    ? await first('SELECT 1 FROM core_collection_productions m JOIN core_productions p ON p.id = m.production_id WHERE m.collection_id = ? AND p.season_id IS NOT ?', id, v.seasonId)
    : null
  if (slugChanged && row.state !== 'draft')
    unit.add(sql`INSERT INTO core_collection_slugs (slug, collection_id, retired_at) VALUES (${row.slug}, ${id}, ${nowMs()})`)
  unit.add(sql`UPDATE core_collections SET name = ${v.name}, slug = ${v.slug}, summary = ${v.summary}, description = ${v.description}, colour = ${v.colour}, season_id = ${v.seasonId}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM core_collections WHERE lower(name) = lower(${v.name}) AND id <> ${id})
      AND (${v.seasonId} IS NULL OR NOT EXISTS (SELECT 1 FROM core_collection_productions m JOIN core_productions p ON p.id = m.production_id WHERE m.collection_id = ${id} AND p.season_id IS NOT ${v.seasonId}))`)
    .expect(1, outside ? { code: 'core.collection.members-elsewhere', reason: 'Some of its productions are in another season.', remedy: 'Remove them first, or leave the collection open to any season.' } : NAME_TAKEN)
  unit.audit({ action: 'update', record: record(id), detail: { fields: Object.keys(input).sort() } })
}

const MOVES: Record<CollectionState, CollectionState[]> = { draft: ['published', 'archived'], published: ['draft', 'archived'], archived: ['published'] }

/** Publish, unpublish, archive or restore (part 3's table). */
export async function moveCollection(unit: UnitView, id: string, to: CollectionState): Promise<void> {
  const row = await collectionRow(id)
  if (!MOVES[row.state].includes(to)) refuse('core.collection.move', `A ${row.state} collection cannot become ${to}.`, { status: 409 })
  const members = sql`EXISTS (SELECT 1 FROM core_collection_productions WHERE collection_id = ${id})`
  const publishedMember = sql`EXISTS (SELECT 1 FROM core_collection_productions m JOIN core_productions p ON p.id = m.production_id WHERE m.collection_id = ${id} AND p.state = 'published')`
  const guard = to === 'published' ? members : to === 'draft' ? sql`NOT ${publishedMember}` : sql`1`
  const refusal = to === 'published' && !row.productions
    ? { code: 'core.collection.empty', reason: 'A collection needs at least one production before it is published.', remedy: 'Add a production first.' }
    : to === 'draft' && await first('SELECT 1 FROM core_collection_productions m JOIN core_productions p ON p.id = m.production_id WHERE m.collection_id = ? AND p.state = \'published\'', id)
      ? { code: 'core.collection.has-published', reason: 'A published production is in this collection.', remedy: 'Archive the collection instead.' }
      : CHANGED
  unit.add(sql`UPDATE core_collections SET state = ${to} WHERE id = ${id} AND state = ${row.state} AND ${guard}`).expect(1, refusal)
  unit.audit({ action: 'state', record: record(id), detail: { from: row.state, to } })
  if (to === 'published') unit.announce('core.collection.published', { collectionId: id }, { record: record(id) })
}

/** Only a draft that has never been public; its memberships go with it. */
export async function deleteCollection(unit: UnitView, id: string): Promise<void> {
  await collectionRow(id)
  unit.add(sql`DELETE FROM core_collections WHERE id = ${id} AND state = 'draft' AND NOT EXISTS (SELECT 1 FROM core_collection_slugs WHERE collection_id = ${id})`)
    .expect(1, { code: 'core.collection.not-deletable', reason: 'Only a draft collection can be deleted.', remedy: 'Archive it instead.' })
  unit.audit({ action: 'delete', record: record(id) })
}

/** Adds productions at the end, each once (CL1 on the statement). Ones already in are left as they are. */
export async function addToCollection(unit: UnitView, id: string, productionIds: string[]): Promise<void> {
  const row = await collectionRow(id)
  const ids = [...new Set(productionIds)]
  const present = new Set((await all<{ production_id: string }>('SELECT production_id FROM core_collection_productions WHERE collection_id = ? AND production_id IN (SELECT value FROM json_each(?))', id, JSON.stringify(ids))).map(r => r.production_id))
  const adding = ids.filter(p => !present.has(p))
  if (!adding.length) return
  const known = await all<{ id: string, season_id: string | null }>('SELECT id, season_id FROM core_productions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(adding))
  if (known.length !== adding.length) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  const misfit = row.season_id !== null && known.some(p => p.season_id !== row.season_id)
  unit.add(sql`INSERT INTO core_collection_productions (collection_id, production_id, sort)
    SELECT ${id}, j.value, (SELECT coalesce(max(sort), -1) + 1 FROM core_collection_productions WHERE collection_id = ${id}) + j.key
      FROM json_each(${JSON.stringify(adding)}) j JOIN core_productions p ON p.id = j.value JOIN core_collections c ON c.id = ${id}
     WHERE (c.season_id IS NULL OR c.season_id = p.season_id)
       AND NOT EXISTS (SELECT 1 FROM core_collection_productions o WHERE o.collection_id = ${id} AND o.production_id = j.value)`).expect(adding.length, misfit ? OTHER_SEASON : CHANGED)
  unit.audit({ action: 'update', record: record(id), detail: { added: adding } })
  unit.announce('core.collection.changed', { collectionId: id, addedIds: adding, removedIds: [] }, { record: record(id) })
}

export async function removeFromCollection(unit: UnitView, id: string, productionIds: string[]): Promise<void> {
  await collectionRow(id)
  const ids = [...new Set(productionIds)]
  unit.add(sql`DELETE FROM core_collection_productions WHERE collection_id = ${id} AND production_id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`).expect(ids.length, CHANGED)
  unit.audit({ action: 'update', record: record(id), detail: { removed: ids } })
  unit.announce('core.collection.changed', { collectionId: id, addedIds: [], removedIds: ids }, { record: record(id) })
}

/** Puts the members in the order given. The list names every member once. */
export async function orderCollection(unit: UnitView, id: string, productionIds: string[]): Promise<void> {
  await collectionRow(id)
  const current = new Set((await all<{ production_id: string }>('SELECT production_id FROM core_collection_productions WHERE collection_id = ?', id)).map(r => r.production_id))
  if (new Set(productionIds).size !== productionIds.length || productionIds.length !== current.size || productionIds.some(p => !current.has(p))) refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  const list = JSON.stringify(productionIds)
  unit.add(sql`UPDATE core_collection_productions SET sort = (SELECT CAST(j.key AS INTEGER) FROM json_each(${list}) j WHERE j.value = core_collection_productions.production_id)
    WHERE collection_id = ${id} AND production_id IN (SELECT value FROM json_each(${list}))`).expect(productionIds.length, CHANGED)
  unit.audit({ action: 'update', record: record(id), detail: { order: true } })
}

/** The picker on a production's record: the collections it should be in, all at once. */
export async function setProductionCollections(unit: UnitView, productionId: string, collectionIds: string[]): Promise<string[]> {
  const now = new Set((await all<{ collection_id: string }>('SELECT collection_id FROM core_collection_productions WHERE production_id = ?', productionId)).map(r => r.collection_id))
  const wanted = new Set(collectionIds)
  const adding = [...wanted].filter(id => !now.has(id))
  const removing = [...now].filter(id => !wanted.has(id))
  for (const id of adding) await addToCollection(unit, id, [productionId])
  for (const id of removing) await removeFromCollection(unit, id, [productionId])
  return [...adding, ...removing]
}

export interface PublicCollection {
  id: string
  slug: string
  name: string
  summary: string | null
  description: string | null
  colour: string
  image: PublicImage | null
  archived: boolean
  /** Published members in the collection's order: current ones first, then past (CL2). */
  productions: SeasonProduction[]
}

/**
 * A published or archived collection by its address; an old address answers `{ moved }`. Null for a
 * draft, and for an archived one while past shows are not public; past members are left out then too.
 */
export async function publicCollection(slug: string, options: { pastVisible?: boolean, now?: number } = {}): Promise<PublicCollection | { moved: string } | null> {
  const pastVisible = options.pastVisible ?? true
  const live = await first<Row>(`${SELECT} WHERE c.slug = ? AND c.state IN ('published', 'archived')`, slug)
  if (!live) {
    const old = await first<{ slug: string }>(`SELECT c.slug FROM core_collection_slugs h JOIN core_collections c ON c.id = h.collection_id
      WHERE h.slug = ? AND c.state IN ('published', 'archived')`, slug)
    return old ? { moved: old.slug } : null
  }
  if (live.state === 'archived' && !pastVisible) return null
  const ids = (await all<{ production_id: string }>('SELECT production_id FROM core_collection_productions WHERE collection_id = ? ORDER BY sort, production_id', live.id)).map(r => r.production_id)
  const cards = await productionCards(ids, options.now)
  const image = await collectionImage(live.id)
  return {
    id: live.id,
    slug: live.slug,
    name: live.name,
    summary: live.summary,
    description: live.description,
    colour: live.colour,
    image,
    archived: live.state === 'archived',
    productions: [...cards.filter(c => !c.past), ...(pastVisible ? cards.filter(c => c.past) : [])],
  }
}

export const COLLECTION_IMAGE = 'core.collection-image'

/** The collection's image, attached through core's files (no column of its own). */
export async function collectionImage(id: string): Promise<PublicImage | null> {
  const r = await first<{ id: string, alt_text: string | null, width: number | null, height: number | null }>(
    `SELECT id, alt_text, width, height FROM core_files WHERE owner_type = 'core.collection' AND owner_id = ? AND slot = ? AND state = 'ready' AND attached_at IS NOT NULL
      ORDER BY attached_at DESC LIMIT 1`, id, COLLECTION_IMAGE)
  return r ? { url: fileUrl(r.id), alt: r.alt_text ?? '', width: r.width, height: r.height } : null
}

/** A production made earlier in this unit joins collections: CL1 on the statement, with its season as given. */
export async function joinCollections(unit: UnitView, productionId: string, seasonId: string | null, collectionIds: string[]): Promise<void> {
  const ids = [...new Set(collectionIds)]
  if (!ids.length) return
  const misfit = !!await first('SELECT 1 FROM core_collections WHERE id IN (SELECT value FROM json_each(?)) AND season_id IS NOT NULL AND season_id IS NOT ?', JSON.stringify(ids), seasonId)
  unit.add(sql`INSERT INTO core_collection_productions (collection_id, production_id, sort)
    SELECT c.id, ${productionId}, (SELECT coalesce(max(o.sort), -1) + 1 FROM core_collection_productions o WHERE o.collection_id = c.id)
      FROM core_collections c WHERE c.id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND (c.season_id IS NULL OR c.season_id IS ${seasonId})`)
    .expect(ids.length, misfit ? OTHER_SEASON : { code: 'core.collection.not-found', reason: 'There is no such collection.' })
  for (const id of ids) {
    unit.audit({ action: 'update', record: record(id), detail: { added: [productionId] } })
    unit.announce('core.collection.changed', { collectionId: id, addedIds: [productionId], removedIds: [] }, { record: record(id) })
  }
}
