// Submits a count with every line counted; what was expected is read now.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { submitStocktake } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stock.count',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { actor, record, unit }) => {
  await submitStocktake(unit, record!.id, actor.accountId!)
  return { ok: true }
})
