// K4's "Add a person": finds people for whoever gives places on this session, who may not search every account.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { searchAccounts } from '#modules/core'

export default defineRoute({
  ability: 'training.place.manage',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(3).max(120) }), // not-policy: the search index needs three letters
}, async (_event, { input }) => ({ people: await searchAccounts(input.q) }))
