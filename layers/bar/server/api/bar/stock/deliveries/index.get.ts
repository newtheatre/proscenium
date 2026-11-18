// Deliveries, drafts first then the latest received, with what the delivery form offers. For
// someone who records allergens, which items' labels are due a fresh look, so a new delivery can
// ask about them before it is received.
import { can, defineRoute } from '#kit'
import { labelsDue } from '../../../../allergen-chart'
import { deliveries, deliveryForm } from '../../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.receive', rateLimit: 'default' }, async (_event, { actor }) => {
  const form = await deliveryForm()
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  return { deliveries: await deliveries(), ...form, canAllergens, labelsDue: canAllergens ? await labelsDue(form.items.map(i => i.id)) : [] }
})
