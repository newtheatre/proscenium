// Find a person by name or address (the picker, searchAccounts in identity/search.ts). Returns a
// name and enough to tell two people apart, never their contact details.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '../../identity/search'

export default defineRoute({
  ability: 'core.account.search',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
