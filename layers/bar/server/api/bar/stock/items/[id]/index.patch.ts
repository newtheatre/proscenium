// Changes a stock item, or retires it (it then leaves every recipe and option). Never deleted.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { stockItemPatch, updateStockItem } from '../../../../../stock'

export default defineRoute({
  ability: 'bar.stock.manage',
  record: event => ['bar.stock-item', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: stockItemPatch,
}, async (_event, { input, record, unit }) => {
  await updateStockItem(unit, record!.id, input)
  return { ok: true }
})
