// Finds an item by the tag on its label, typed or scanned (INV-13, S17).
import { getRouterParam } from 'h3'
import { defineRoute, refuse, requireAbility } from '#kit'
import { itemByTag } from '../../../../reading'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const found = await itemByTag(decodeURIComponent(getRouterParam(event, 'tag') ?? ''))
  if (!found) return refuse('inventory.item.no-tag', 'No item has that tag.', { status: 404, remedy: 'Check the tag and try again.' })
  await requireAbility(actor, 'inventory.item.view', ['inventory.item', found.id])
  return { itemId: found.id }
})
