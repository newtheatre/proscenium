// Undoes a payment out recorded by mistake: the owner's record is marked unpaid again.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reverseDisbursement } from '../../../../disbursements'

export default defineRoute({ ability: 'payments.disbursement.record', rateLimit: 'write', idempotent: true, input: z.object({}) }, async (event, { unit }) => ({
  reversalId: await reverseDisbursement(unit, getRouterParam(event, 'id') ?? ''),
}))
