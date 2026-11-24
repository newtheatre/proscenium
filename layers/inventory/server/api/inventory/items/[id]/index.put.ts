// Changes an item. A new category within its department brings that category's inspections (I12);
// tracking is fixed once the item has been lent or inspected (I4).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { categoryRow } from '../../../../departments'
import { itemInput } from '../../../../inputs'
import { itemCore, updateItem } from '../../../../items'

export default defineRoute({
  ability: 'inventory.item.edit',
  record: event => ['inventory.item', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: itemInput,
}, async (event, { input, unit, actor }) => {
  const item = await itemCore(getRouterParam(event, 'id')!)
  await updateItem(unit.view(), item, await categoryRow(input.categoryId), input, actor.accountId ?? null)
  return { itemId: item.id }
})
