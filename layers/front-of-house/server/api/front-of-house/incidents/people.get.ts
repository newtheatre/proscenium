// The person picker on a report's Who step (IN-1): whoever can report an incident may find the people
// involved, without the site-wide people search (as the shift's "Add a person", FH-12). The same
// answer as the core's picker, a name and enough to tell two people apart, never contact details.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'front-of-house.incident.report',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
