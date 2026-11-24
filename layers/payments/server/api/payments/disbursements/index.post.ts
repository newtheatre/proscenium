// Records money paid out against one or more of an owner's records, such as approved claims (P-A1,
// Budgets BC-30): the owner's handler checks each part and Payments posts it, all in one unit.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { DISBURSEMENT_METHODS, recordDisbursements } from '../../../disbursements'

export default defineRoute({
  ability: 'payments.disbursement.record',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    owner: z.string().regex(/^[a-z][a-z0-9-]*$/).max(40), // not-policy: a module id
    parts: z.array(z.object({ record: z.string().min(1).max(40), amountMinor: z.number().int().positive() })).min(1).max(100), // not-policy: a sanity bound on one payment's parts
    method: z.enum(DISBURSEMENT_METHODS as [string, ...string[]]),
    paidOn: z.iso.date(),
    reference: z.string().max(80).nullable().optional(), // not-policy: checked again at the column's bound
  }).strict(),
}, async (_event, { input, unit }) => ({
  disbursementIds: await recordDisbursements(unit, { ...input, method: input.method as (typeof DISBURSEMENT_METHODS)[number] }),
}))
