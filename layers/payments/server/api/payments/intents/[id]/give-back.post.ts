// Gives back what was taken for a desk sale paid in part and then abandoned (BO-35): the sale ends,
// what was prepared for it is released, and each payment goes back the way it came. The seller
// confirms, by asking, that they have handed back the cash and refunded on any standalone machine or
// in the SumUp app; a card the provider refunds is sent afterwards.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { confirmHandBacks, giveBack } from '../../../../giveback'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  const { refundIds, attempts } = await giveBack(unit.view(), getRouterParam(event, 'id') ?? '', actor)
  await unit.commit()
  return { givenBack: true, ...await confirmHandBacks(refundIds, attempts, actor.accountId!) }
})
