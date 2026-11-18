// A booking, for whoever holds the link from its message (no sign-in, and nothing about the buyer),
// or for the signed-in person whose booking it is, by its id.
import { defineRoute, refuse } from '#kit'
import { orderKeyOf } from '../../../../order-key'
import { orderByLink } from '../../../../reservations'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event, { actor }) => {
  const order = await orderByLink(orderKeyOf(event, actor))
  if (!order) refuse('box-office.order.not-found', 'This link does not open a booking.', { status: 404 })
  return order
})
