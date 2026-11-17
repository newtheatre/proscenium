// The till's buyer box: find who to email the tickets to, by name or address (Matt, 17 November:
// sellers may search people, but only inside this box). The same answer as the person picker, a
// name and enough to tell two people apart, never contact details; picking one only sends the
// tickets to them and joins the order to their bookings.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'box-office.order.sell',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
