// Staff save a company's or a person's bank details from a bill or a supplier's invoice (P-A1).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { savePayee } from '../../payees'

export default defineRoute({
  ability: 'payments.payee.manage',
  rateLimit: 'write',
  input: z.object({
    party: z.object({ module: z.enum(['core', 'companies']), id: z.string().min(1).max(40) }), // not-policy: an id's length
    accountName: z.string().max(70), sortCode: z.string().max(10), accountNumber: z.string().max(12), // not-policy: what a bank form takes
  }),
}, async (_event, { input, unit }) => ({ payeeId: await savePayee(unit, input.party, input) }))
