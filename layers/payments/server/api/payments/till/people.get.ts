// The till's receipt box: find who to send the receipt to, by name or address (Matt, 17 November:
// sellers may search people, but only inside this box, first made for emailing tickets). The same
// answer as the person picker, a name and enough to tell two people apart, never contact details,
// with the common email providers the box offers a typed name at.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120).optional() }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({
  people: input.q ? await searchAccounts(input.q) : [],
  emailDomains: await useSetting('payments.desk.email-domains') as string[],
}))
