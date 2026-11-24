// Moving items between locations (INV-14). Moving is not lending: an item away from home records
// where it is now, and moving it home clears that (I5). A container takes its contents with it (I6).
import { all, newId, nowMs, refuse, type UnitView } from '#kit'

const HELD = `SELECT 1 FROM inventory_loan_lines l WHERE l.item_id = i.id AND l.state IN ('promised', 'out')`

export async function moveItems(unit: UnitView, itemIds: string[], locationId: string, actorId: string | null): Promise<number> {
  const ids = JSON.stringify(itemIds)
  // The items named, and what is in any of them, unless it is itself named.
  const scope = `(i.id IN (SELECT value FROM json_each(?1)) OR i.container_id IN (SELECT value FROM json_each(?1)))`
  const moving = await all<{ id: string, tag: string, from: string, held: number, disposed: number, contained: number }>(
    `SELECT i.id, i.tag, coalesce(i.current_location_id, i.home_location_id) AS "from", EXISTS (${HELD}) AS held, i.state = 'disposed' AS disposed,
            (i.container_id IS NOT NULL AND i.container_id NOT IN (SELECT value FROM json_each(?1))) AS contained
       FROM inventory_items i WHERE ${scope}`, ids)
  if (moving.filter(m => itemIds.includes(m.id)).length !== new Set(itemIds).size) refuse('inventory.item.not-found', 'One of these items no longer exists.', { status: 404 })
  const held = moving.filter(m => m.held || m.disposed).map(m => m.tag)
  if (held.length) refuse('inventory.item.on-loan', `${held.join(', ')} ${held.length === 1 ? 'is' : 'are'} promised or out on a loan, or disposed of, so cannot be moved by hand.`, { detail: { tags: held.join(',') }, remedy: 'Return it through its loan first.' })
  const contained = moving.filter(m => m.contained).map(m => m.tag)
  if (contained.length) refuse('inventory.item.in-container', `${contained.join(', ')} ${contained.length === 1 ? 'is' : 'are'} in a container, so move with it.`, { detail: { tags: contained.join(',') }, remedy: 'Move the container, or take it out of the container first.' })
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO inventory_item_events (id, item_id, kind, from_location_id, to_location_id, actor, at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.item'), 'moved', json_extract(value, '$.from'), ?, ?, ? FROM json_each(?)`,
    params: [locationId, actorId, at, JSON.stringify(moving.map(m => ({ id: newId('kev'), item: m.id, from: m.from })))],
  })
  unit.add({
    sql: `UPDATE inventory_items AS i SET current_location_id = CASE WHEN i.home_location_id = ?2 THEN NULL ELSE ?2 END, updated_at = ?3
           WHERE ${scope} AND i.state != 'disposed' AND NOT EXISTS (${HELD})
             AND EXISTS (SELECT 1 FROM inventory_locations l WHERE l.id = ?2 AND l.state = 'active')`,
    params: [ids, locationId, at],
  }).expect(moving.length, { code: 'inventory.item.moved', reason: 'Something changed just now, or that location is archived.', remedy: 'Reload and try again.' })
  unit.audit({ action: 'update', detail: { moved: String(moving.length), to: locationId } })
  return moving.length
}
