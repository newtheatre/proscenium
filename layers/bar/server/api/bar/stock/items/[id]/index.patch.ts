// Changes a stock item, or retires it (it then leaves every recipe and option). Never deleted.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { stockItemPatch, updateStockItem } from '../../../../../stock'

export default defineRoute({
  ability: 'bar.stock.manage',
  record: event => ['bar.stock-item', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: stockItemPatch,
}, async (_event, { input, record, unit }) => {
  await updateStockItem(unit, record!.id, input)
  return { ok: true }
})
