// One item (S2, INV-16): what it is, where it is, whether it is safe to lend, and its history.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { dueWindow, itemDetail } from '../../../../reading'
import type { ItemPage } from '../../../../../shared/items'

export default defineRoute({
  ability: 'inventory.item.view',
  record: event => ['inventory.item', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const editable = (await can(actor, 'inventory.item.edit', ['inventory.item', id])).allowed
  return { item: await itemDetail(id, editable), editable, ...await dueWindow() } satisfies ItemPage
})
