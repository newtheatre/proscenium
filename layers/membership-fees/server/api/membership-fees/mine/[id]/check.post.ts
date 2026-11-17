// After paying on the page, or coming back from the bank: asks the provider now whether the money
// arrived. Settling activates the membership exactly as the webhook would.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { checkPayment } from '../../../../paying'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor }) => {
  await checkPayment(getRouterParam(event, 'id')!, actor.accountId!)
  return { checked: true }
})
