// One delivery for its page (S9): a draft to finish and receive, or the record of one received. For
// someone who records allergens, which items' labels are due a fresh look: every item the form
// offers, so a line added before receiving is asked about too, and those received.
import { getRouterParam } from 'nuxt/server'
import { can, defineRoute, refuse } from '#kit'
import { labelsDue } from '../../../../allergen-chart'
import { deliveries, deliveryForm } from '../../../../stock-moves'

export default defineRoute({
  ability: 'bar.stock.receive',
  record: event => ['bar.delivery', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const [delivery] = await deliveries({ id: record!.id, limit: 1 })
  if (!delivery) refuse('bar.delivery.unknown', 'There is no such delivery.', { status: 404 })
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  const form = await deliveryForm()
  return {
    delivery,
    ...form,
    canAllergens,
    labelsDue: canAllergens ? await labelsDue([...new Set([...form.items.map(i => i.id), ...delivery!.lines.map(l => l.stockItemId)])]) : [],
  }
})
