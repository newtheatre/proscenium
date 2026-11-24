// The person picker on a course's Trainers tab (K2): for a course manager, who may not search every account.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'training.course.manage',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
