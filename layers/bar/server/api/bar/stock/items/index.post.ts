// Adds a stock item: what is counted, its pack as delivered and the unit people count in.
import { defineRoute } from '#kit'
import { addStockItem, stockItemInput } from '../../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'write', input: stockItemInput }, async (_event, { input, unit }) => ({ stockItemId: await addStockItem(unit, input) }))
