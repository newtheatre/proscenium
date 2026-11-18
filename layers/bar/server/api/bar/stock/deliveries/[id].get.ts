// One delivery for its page (S9): a draft to finish and receive, or the record of one received. A
// draft says which of its items' labels are due a fresh look, for someone who records allergens.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { labelsDue } from '../../../../allergen-chart'
import { deliveries, deliveryForm } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const [delivery] = await deliveries({ id: record!.id, limit: 1 })
  if (!delivery) refuse('bar.delivery.unknown', 'There is no such delivery.', { status: 404 })
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  return {
    delivery,
    ...await deliveryForm(),
    canAllergens,
    labelsDue: canAllergens && delivery!.state === 'draft' ? await labelsDue(delivery!.lines.map(l => l.stockItemId)) : [],
  }
})
