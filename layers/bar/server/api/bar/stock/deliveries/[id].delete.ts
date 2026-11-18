// Throws a draft delivery away.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { discardDelivery } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await discardDelivery(unit, record!.id)
  return { ok: true }
})
