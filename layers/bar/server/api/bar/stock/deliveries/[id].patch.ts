// Changes a draft delivery; a received one is final.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deliveryPatch, updateDelivery } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: deliveryPatch,
}, async (_event, { input, record, unit }) => {
  await updateDelivery(unit, record!.id, input)
  return { ok: true }
})
