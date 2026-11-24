// Whether bank details are on file for each of an owner's records, masked (P-A1, Budgets BC-29):
// the payments-to-make screen shows "on file" or "missing", never the details.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { payeeOfRecord } from '../../../disbursements'

export default defineRoute({
  ability: 'payments.disbursement.record',
  rateLimit: 'default',
  input: z.object({
    owner: z.string().regex(/^[a-z][a-z0-9-]*$/).max(40), // not-policy: a module id
    records: z.string().max(4000).transform(s => s.split(',').filter(Boolean)).pipe(z.array(z.string().max(40)).max(100)), // not-policy: a sanity bound
  }),
}, async (_event, { input }) => {
  const payees: Record<string, { held: boolean, initial: string | null, lastDigits: string | null } | null> = {}
  for (const record of input.records) {
    const payee = await payeeOfRecord({ module: input.owner, record })
    payees[record] = payee && { held: payee.held, initial: payee.initial, lastDigits: payee.lastDigits }
  }
  return { payees }
})
