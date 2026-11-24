// Confirms an approved refund was handed back, for cash or a standalone card machine.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { confirmRefund } from '../../../../refunds'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  await confirmRefund(unit.view(), getRouterParam(event, 'id', { decode: true }) ?? '', actor.accountId!)
  return { refunded: true }
})
