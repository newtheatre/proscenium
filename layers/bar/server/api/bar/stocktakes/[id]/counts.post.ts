// Enters counts, by number or by weight, or takes lines out of the count.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { enterCounts, countInput } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stock.count',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: countInput,
}, async (_event, { record, unit, input }) => {
  await enterCounts(unit, record!.id, input)
  return { ok: true }
})
