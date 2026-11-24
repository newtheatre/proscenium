// Ask to spend (BC-15): a line of an approved budget, an amount, what it is for, and when it is needed.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { makeRequest } from '../../../requests'

export default defineRoute({
  ability: 'budgets.request.make',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lineId: z.string().max(40), // not-policy: ids are short
    amountMinor: z.number().int().positive().max(100_000_000), // not-policy: a sanity bound, a million pounds
    description: z.string().trim().min(1).max(500), // not-policy: the column's bound
    neededBy: z.iso.date().nullable().optional(),
  }).strict(),
}, async (_event, { input, unit, actor }) => ({ requestId: await makeRequest(unit, actor, input) }))
