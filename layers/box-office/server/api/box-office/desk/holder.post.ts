// Who a ticket of a type with requirements is for, at the till: a card scanned, such as a membership
// card, or a person found by name, and whether they qualify. Reads only: the sale checks again.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deskHolder } from '../../../desk'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: an id
    ticketTypeId: z.string().min(1).max(64), // not-policy: an id
    code: z.string().trim().min(1).max(512).optional(), // not-policy: longer than any door code
    accountId: z.string().min(1).max(64).optional(), // not-policy: an id
  }).strict().refine(i => !!i.code !== !!i.accountId, { message: 'A card or a person, one of them.' }),
}, async (_event, { input }) => deskHolder(input))
