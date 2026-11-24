// The people box on "Sign someone off" (M9): the person picker's answer, for someone who trains a course.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'training.teaching.view',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
