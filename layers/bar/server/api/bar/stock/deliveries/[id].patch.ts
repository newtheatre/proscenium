// Changes a draft delivery; a received one is final.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deliveryPatch, updateDelivery } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: deliveryPatch,
}, async (_event, { input, record, unit }) => {
  await updateDelivery(unit, record!.id, input)
  return { ok: true }
})
