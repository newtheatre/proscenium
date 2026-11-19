// Links this device to another seller's till with the code their device shows (../../../till-link).
// The answer is a pass the page keeps and trades for realtime tickets.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { acceptLink } from '../../../till-link'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'presented-value',
  input: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), // not-policy: a link code's length
}, async (_event, { input, actor }) => acceptLink(input.code, actor.accountId!))
