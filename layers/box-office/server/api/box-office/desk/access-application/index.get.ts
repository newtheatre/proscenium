// The access scheme's application form for a seller to fill in with somebody at the till, such as
// for a wheelchair space: the needs to tick and whether they have applied already. The person is
// one found in the till's own box. Reads only.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deskAccessApplication } from '../../../../desk'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: an id
    accountId: z.string().min(1).max(64), // not-policy: an id
  }),
}, async (_event, { input }) => deskAccessApplication(input))
