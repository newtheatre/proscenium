// Abandons a count; nothing moves. Your own, or any if you approve counts.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { abandonStocktake } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stock.count',
  record: event => ['bar.stocktake', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { actor, record, unit }) => {
  await abandonStocktake(unit, record!.id, actor.accountId!, (await can(actor, 'bar.stocktake.approve')).allowed)
  return { ok: true }
})
