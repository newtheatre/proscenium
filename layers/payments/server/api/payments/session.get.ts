// My till session, if one is open, with the cash expected in it so far and the payments in it still
// waiting for an answer, which stop it being counted. cashTaken says whether to ask for a float.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { sessionOf, summarise, waitingIn } from '../../sessions'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  const session = await sessionOf(actor.accountId!)
  const cashTaken = !!(await useSetting('payments.cash.enabled'))
  return { cashTaken, session: session ? await summarise(session, undefined, cashTaken) : null, waiting: session ? await waitingIn(session.id) : [] }
})
