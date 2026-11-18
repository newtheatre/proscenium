// The promotions the seller may pick for a sale at the till (payments.pricing's choices): none where
// nothing prices sales. Reads only.
import { defineRoute } from '#kit'
import { staffChoices } from '../../../pricing'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
}, async () => ({ choices: await staffChoices() }))
