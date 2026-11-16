// Cancels a desk payment nobody has paid anything towards, and releases what was prepared for it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { cancelIntent } from '../../../../intents'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await cancelIntent(unit.view(), id)
  return { cancelled: true }
})
