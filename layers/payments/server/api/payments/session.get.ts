// My till session, if one is open, with the cash expected in it so far.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf, summarise } from '../../sessions'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  const session = await sessionOf(actor.accountId!)
  return { session: session ? await summarise(session) : null }
})
