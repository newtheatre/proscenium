// After paying on the page, or coming back from the bank: asks the provider now whether the money
// arrived, for whoever holds the basket's token, and answers the basket as it stands.
import { z } from 'zod'
import { getHeader, getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { checkPayment } from '../../../../checkout'
import { fromRequest } from '../../../../links'

export default defineRoute({ public: true, rateLimit: 'write', input: z.object({}).strict() }, async (event) => {
  // Noted for the message sent if this settles the payment.
  await fromRequest(event)
  return checkPayment(getRouterParam(event, 'id')!, getHeader(event, 'x-basket-token') ?? '')
})
