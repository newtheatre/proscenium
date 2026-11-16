// Refunds by state, newest first: what Refunds lists for approval and follow-up.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listRefunds } from '../../refunds'

const STATES = ['requested', 'approved', 'sent', 'succeeded', 'failed', 'declined'] as const

export default defineRoute({
  ability: 'payments.refund.approve',
  rateLimit: 'default',
  input: z.object({
    state: z.enum(STATES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50), // not-policy: a page of refunds
  }),
}, async (_event, { input }) => ({ refunds: await listRefunds(input.state ? [input.state] : ['requested', 'approved', 'sent', 'failed'], input.limit) }))
