// Approves a submitted count: the levels change by what it found.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { approveStocktake } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stocktake.approve',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { actor, record, unit }) => {
  return await approveStocktake(unit, record!.id, actor.accountId!)
})
