// A payment's state: what is paid, refunded by part, and whether anything is still waiting.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, Refusal } from '#kit'
import { intentStatus } from '../../../intents'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'default',
  input: z.object({}),
}, async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const status = await intentStatus(id)
  if (!status) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  return status
})
