// A booking, for whoever holds the link from its message: no sign-in, and nothing about the buyer.
import { getHeader } from 'h3'
import { defineRoute, refuse } from '#kit'
import { orderByLink } from '../../../../reservations'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const order = await orderByLink(getHeader(event, 'x-order-token') ?? '')
  if (!order) refuse('box-office.order.not-found', 'This link does not open a booking.', { status: 404 })
  return order
})
