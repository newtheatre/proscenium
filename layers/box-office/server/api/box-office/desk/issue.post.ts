// A sale at the till with nothing to pay, such as a pass's entry for tonight (BO-64): booked and its
// tickets issued at once, without the till taking a payment, and admitted if the holder goes in now.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { issueDeskSale } from '../../../desk'
import { fromRequest } from '../../../links'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'write',
  idempotent: true,
  // The box office panel's own input, as it gives the till; checked inside.
  input: z.object({ sale: z.unknown() }).strict(),
}, async (event, { input, unit }) => {
  await fromRequest(event)
  return issueDeskSale(unit.view(), input.sale)
})
