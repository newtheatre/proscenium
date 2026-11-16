// Starts the payment with the online provider for an order waiting to be paid, for whoever holds
// the basket's token. The answer says where the buyer goes next: the provider's page or its form.
import { z } from 'zod'
import { getHeader, getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { relyingParty } from '#modules/core'
import { startPayment } from '../../../../checkout'
import { fromRequest } from '../../../../links'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({ providerAccountId: idSchema('ppa').optional() }).strict(),
}, async (event, { input }) => {
  // Noted for the message sent when the payment settles, which a job may do with no request.
  await fromRequest(event)
  return startPayment({ orderId: getRouterParam(event, 'id')!, token: getHeader(event, 'x-basket-token') ?? '', providerAccountId: input.providerAccountId, origin: relyingParty(event).origin })
})
