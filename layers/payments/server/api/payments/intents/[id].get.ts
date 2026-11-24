// A payment's state: what is paid, refunded by part, and whether anything is still waiting.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, Refusal } from '#kit'
import { intentStatus } from '../../../intents'
import { splitStatus } from '../../../splits'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'default',
  input: z.object({}),
}, async (event) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const status = await intentStatus(id)
  if (!status) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  // A till sale split between people says what each person pays for, and who has paid.
  const splits = await splitStatus(id)
  return splits.length ? { ...status, splits } : status
})
