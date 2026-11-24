// The person picker on a shift's "Add a person" (FH-12): whoever runs the rota for this performance
// may find people to put on it, without the site-wide people search (Matt, 17 November: a module
// may offer the picker's search inside one narrow screen under its own ability). The same answer as
// the core's picker, a name and enough to tell two people apart, never contact details.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
