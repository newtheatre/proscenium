// Asks the provider now about a payment still waiting, for a screen that has just watched the person
// pay (the online card form's test payment), rather than waiting for the webhook.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, Refusal } from '#kit'
import { refreshIntent } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event) => {
  const status = await refreshIntent(getRouterParam(event, 'id') ?? '')
  if (!status) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  return status
})
