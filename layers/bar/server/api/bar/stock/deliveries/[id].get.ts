// One delivery for its page (S9): a draft to finish and receive, or the record of one received.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { deliveries, deliveryForm } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const [delivery] = await deliveries({ id: record!.id, limit: 1 })
  if (!delivery) refuse('bar.delivery.unknown', 'There is no such delivery.', { status: 404 })
  return { delivery, ...await deliveryForm() }
})
