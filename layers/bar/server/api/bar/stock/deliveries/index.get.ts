// Deliveries, drafts first then the latest received, with what the delivery form offers.
import { defineRoute } from '#kit'
import { deliveries, deliveryForm } from '../../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.receive', rateLimit: 'default' }, async () => ({ deliveries: await deliveries(), ...await deliveryForm() }))
