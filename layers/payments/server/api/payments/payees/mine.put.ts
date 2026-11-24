// A person gives, or replaces, the bank details the theatre pays them back to (P-A1).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { savePayee } from '../../../payees'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ accountName: z.string().max(70), sortCode: z.string().max(10), accountNumber: z.string().max(12) }), // not-policy: what a bank form takes
}, async (_event, { input, unit, actor }) => {
  await savePayee(unit, { module: 'core', id: actor.accountId! }, input)
  return { saved: true }
})
