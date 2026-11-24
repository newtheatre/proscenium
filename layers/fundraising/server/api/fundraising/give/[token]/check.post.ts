// Back from paying: asks the provider now whether the money arrived.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { checkGift } from '../../../../giving'

export default defineRoute({ public: true, tokens: ['token'], rateLimit: 'write', input: z.object({}).strict() }, async (event) => {
  await checkGift(getRouterParam(event, 'token')!)
  return { checked: true }
})
