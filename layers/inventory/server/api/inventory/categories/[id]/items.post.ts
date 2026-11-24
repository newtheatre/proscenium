// Adds an item to a category, or several alike, each with its tag at once (INV-10, INV-11).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { categoryRow } from '../../../../departments'
import { newItemsInput } from '../../../../inputs'
import { addItems } from '../../../../items'

export default defineRoute({
  ability: 'inventory.item.edit',
  record: event => ['inventory.category', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: newItemsInput,
}, async (event, { input, unit, actor }) => ({ itemIds: await addItems(unit.view(), await categoryRow(getRouterParam(event, 'id')!), input, actor.accountId ?? null) }))
