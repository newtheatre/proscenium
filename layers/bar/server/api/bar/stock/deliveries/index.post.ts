// Starts a delivery as a draft.
import { defineRoute } from '#kit'
import { addDelivery, deliveryInput } from '../../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.receive', rateLimit: 'write', input: deliveryInput }, async (_event, { actor, input, unit }) =>
  ({ deliveryId: await addDelivery(unit, input, actor.accountId!) }))
