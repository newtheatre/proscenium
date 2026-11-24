// Moves items, and containers with their contents, to a location (INV-14, I5, I6). Each item's
// department must be one this person may edit.
import { all, defineRoute, requireAbility } from '#kit'
import { moveInput } from '../../../inputs'
import { moveItems } from '../../../moving'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: moveInput }, async (_event, { input, unit, actor }) => {
  const departments = await all<{ department_id: string }>(
    'SELECT DISTINCT c.department_id FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id WHERE i.id IN (SELECT value FROM json_each(?))', JSON.stringify(input.itemIds))
  for (const d of departments) await requireAbility(actor, 'inventory.item.edit', ['inventory.department', d.department_id])
  return { moved: await moveItems(unit.view(), input.itemIds, input.locationId, actor.accountId ?? null) }
})
