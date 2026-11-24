// Storage locations (INV-07): stores, rooms, rails and shelves as a tree at most four deep, each
// optionally in a venue or one of its spaces, inherited by children that name none.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { LOCATION_DEPTH, type Location } from '../shared/setup'
import type { LocationInput } from './inputs'

interface LocationRow { id: string, name: string, parent_id: string | null, venue_id: string | null, space_id: string | null, state: Location['state'], items: number | null, children: number | null }

const toLocation = (r: LocationRow): Location => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  venueId: r.venue_id,
  spaceId: r.space_id,
  state: r.state,
  items: r.items ?? 0,
  children: r.children ?? 0,
})

const LOCATION_SELECT = `SELECT l.*,
    (SELECT count(*) FROM inventory_items i WHERE (i.home_location_id = l.id OR i.current_location_id = l.id) AND i.state != 'disposed') AS items,
    (SELECT count(*) FROM inventory_locations c WHERE c.parent_id = l.id AND c.state = 'active') AS children
  FROM inventory_locations l`

export async function listLocations(): Promise<Location[]> {
  return (await all<LocationRow>(`${LOCATION_SELECT} ORDER BY l.state = 'archived', l.sort, lower(l.name)`)).map(toLocation)
}

export async function locationRow(id: string): Promise<Location> {
  const row = await first<LocationRow>(`${LOCATION_SELECT} WHERE l.id = ?`, id)
  return row ? toLocation(row) : refuse('inventory.location.not-found', 'There is no such location.', { status: 404 })
}

// How deep a location sits (1 at the top), and how many levels it and everything inside it span.
const DEPTH_OF = (param: string) => `(WITH RECURSIVE up(id, d) AS (SELECT ${param}, 1 UNION ALL SELECT l.parent_id, up.d + 1 FROM inventory_locations l JOIN up ON l.id = up.id WHERE l.parent_id IS NOT NULL) SELECT max(d) FROM up)`
const HEIGHT_OF = (param: string) => `(WITH RECURSIVE down(id, h) AS (SELECT ${param}, 1 UNION ALL SELECT l.id, down.h + 1 FROM inventory_locations l JOIN down ON l.parent_id = down.id) SELECT max(h) FROM down)`
const INSIDE = (param: string) => `(WITH RECURSIVE down(id) AS (SELECT ${param} UNION ALL SELECT l.id FROM inventory_locations l JOIN down ON l.parent_id = down.id) SELECT id FROM down)`

// The place it names is real: an active parent, an active venue, and a space of that venue.
const PLACE_OK = `(?3 IS NULL OR EXISTS (SELECT 1 FROM inventory_locations p WHERE p.id = ?3 AND p.state = 'active'))
  AND (?4 IS NULL OR EXISTS (SELECT 1 FROM core_venues v WHERE v.id = ?4 AND v.state = 'active'))
  AND (?5 IS NULL OR EXISTS (SELECT 1 FROM core_spaces s WHERE s.id = ?5 AND s.venue_id = ?4))`
const NAME_FREE = 'NOT EXISTS (SELECT 1 FROM inventory_locations o WHERE o.id != ?1 AND o.state = \'active\' AND coalesce(o.parent_id, \'\') = coalesce(?3, \'\') AND lower(o.name) = lower(?2))'

const TAKEN = { code: 'inventory.location.taken', reason: 'There is already a location with that name in the same place.', remedy: 'Choose another name.' }

async function checkPlace(input: LocationInput, height = 1): Promise<void> {
  if (input.spaceId && !input.venueId) refuse('inventory.location.space-without-venue', 'A space is chosen within a venue.', { remedy: 'Choose the venue first.' })
  if (!input.parentId) return
  const parent = await first<{ state: string, depth: number }>(`SELECT state, ${DEPTH_OF('?1')} AS depth FROM inventory_locations WHERE id = ?1`, input.parentId)
  if (!parent || parent.state !== 'active') refuse('inventory.location.parent-archived', 'The location it is inside is archived or no longer exists.', { remedy: 'Reload and choose again.' })
  if (parent.depth + height > LOCATION_DEPTH) {
    refuse('inventory.location.too-deep', `Locations go at most ${LOCATION_DEPTH} levels deep.`, { remedy: 'Put it somewhere less deep.', detail: { depth: String(LOCATION_DEPTH) } })
  }
}

export async function addLocation(unit: UnitView, input: LocationInput): Promise<string> {
  await checkPlace(input)
  const id = newId('kloc')
  unit.add({
    sql: `INSERT INTO inventory_locations (id, name, parent_id, venue_id, space_id, sort, created_at, updated_at)
          SELECT ?1, ?2, ?3, ?4, ?5, (SELECT coalesce(max(sort), 0) + 1 FROM inventory_locations WHERE coalesce(parent_id, '') = coalesce(?3, '')), ?6, ?6
           WHERE ${PLACE_OK} AND ${NAME_FREE} AND (?3 IS NULL OR ${DEPTH_OF('?3')} < ?7)`,
    params: [id, input.name, input.parentId, input.venueId, input.spaceId, nowMs(), LOCATION_DEPTH],
  }).expect(1, TAKEN)
  unit.audit({ action: 'create', record: ['inventory.location', id], detail: {} })
  return id
}

// Moving a location carries everything inside it; it never goes inside itself, nor past four deep.
export async function updateLocation(unit: UnitView, location: Location, input: LocationInput): Promise<void> {
  const moving = input.parentId !== location.parentId
  if (moving && input.parentId) {
    const inside = await first(`SELECT 1 AS yes WHERE ?2 IN ${INSIDE('?1')}`, location.id, input.parentId)
    if (inside) refuse('inventory.location.inside-itself', 'A location cannot go inside itself or anything inside it.', { remedy: 'Choose another place.' })
    const height = await first<{ h: number }>(`SELECT ${HEIGHT_OF('?1')} AS h`, location.id)
    await checkPlace(input, height?.h ?? 1)
  }
  else await checkPlace({ ...input, parentId: null })
  unit.add({
    sql: `UPDATE inventory_locations SET name = ?2, parent_id = ?3, venue_id = ?4, space_id = ?5, updated_at = ?6
           WHERE id = ?1 AND ${PLACE_OK} AND ${NAME_FREE}
             AND (?3 IS NULL OR (?3 NOT IN ${INSIDE('?1')} AND ${DEPTH_OF('?3')} + ${HEIGHT_OF('?1')} <= ?7))`,
    params: [location.id, input.name, input.parentId, input.venueId, input.spaceId, nowMs(), LOCATION_DEPTH],
  }).expect(1, TAKEN)
  unit.audit({ action: 'update', record: ['inventory.location', location.id], detail: moving ? { moved: 'yes' } : {} })
}

// I8: a location holding items, or with active places inside it, is refused archiving, naming the count.
export function setLocationState(unit: UnitView, location: Location, to: 'active' | 'archived'): void {
  if (to === 'archived' && location.items > 0) {
    refuse('inventory.location.in-use', `${location.items} ${location.items === 1 ? 'item is' : 'items are'} kept here.`, { remedy: 'Move them somewhere else first.', detail: { items: String(location.items) } })
  }
  if (to === 'archived' && location.children > 0) {
    refuse('inventory.location.has-places', `${location.children} active ${location.children === 1 ? 'location is' : 'locations are'} inside this one.`, { remedy: 'Archive or move them first.', detail: { locations: String(location.children) } })
  }
  unit.add({
    sql: `UPDATE inventory_locations SET state = ?2, updated_at = ?3 WHERE id = ?1 AND state != ?2
             AND (?2 = 'active' OR (NOT EXISTS (SELECT 1 FROM inventory_items i WHERE (i.home_location_id = ?1 OR i.current_location_id = ?1) AND i.state != 'disposed')
               AND NOT EXISTS (SELECT 1 FROM inventory_locations c WHERE c.parent_id = ?1 AND c.state = 'active')))
             AND (?2 = 'archived' OR ((parent_id IS NULL OR EXISTS (SELECT 1 FROM inventory_locations p WHERE p.id = inventory_locations.parent_id AND p.state = 'active'))
               AND NOT EXISTS (SELECT 1 FROM inventory_locations o WHERE o.id != ?1 AND o.state = 'active' AND coalesce(o.parent_id, '') = coalesce(inventory_locations.parent_id, '') AND lower(o.name) = lower(inventory_locations.name))))`,
    params: [location.id, to, nowMs()],
  }).expect(1, { code: 'inventory.location.changed', reason: 'This location changed just now, the location it is inside is archived, or another location there has its name.', remedy: 'Reload the list.' })
  unit.audit({ action: 'state', record: ['inventory.location', location.id], detail: { to } })
}
