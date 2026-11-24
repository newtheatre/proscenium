// The person picker's search when making a holder (BC-14): the same answer as core's picker, a name
// and enough to tell two people apart, under the ability to manage budgets.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'budgets.budget.manage',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
