// A code that links someone else's device to my till (../../../till-link): shown on my device,
// typed or scanned on theirs within two minutes.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { offerLink } from '../../../till-link'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { actor }) => offerLink(actor.accountId!))
