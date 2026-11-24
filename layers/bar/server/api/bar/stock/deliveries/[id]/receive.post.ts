// Receives a draft delivery: its stock arrives at its location in one batch, and it becomes final.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { receiveDelivery } from '../../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { actor, record, unit }) => {
  await receiveDelivery(unit, record!.id, actor.accountId!)
  return { ok: true }
})
