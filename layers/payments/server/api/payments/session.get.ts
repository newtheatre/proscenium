// The "Your session" card on Sessions: my open session, if any, with the cash expected in it so far,
// when it closes itself if nothing more is sold, and the payments in it still waiting for an answer;
// and my sessions that stopped and await their count. cashTaken says whether to ask for a float.
// mayOpen and mayViewAll say what the page shows: the card, the list of every session, or both.
import { z } from 'zod'
import { can, defineRoute, useSetting } from '#kit'
import { awaitingCountOf, closesAt, lastSaleIn, sessionOf, summarise, waitingIn } from '../../sessions'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  const mayOpen = (await can(actor, 'payments.session.open')).allowed
  const mayViewAll = (await can(actor, 'payments.session.view')).allowed
  const cashTaken = !!(await useSetting('payments.cash.enabled'))
  const session = mayOpen ? await sessionOf(actor.accountId!) : null
  const awaiting = mayOpen ? await awaitingCountOf(actor.accountId!) : []
  return {
    mayOpen,
    mayViewAll,
    cashTaken,
    session: session ? { ...await summarise(session, undefined, cashTaken), lastSaleAt: await lastSaleIn(session), closesAt: await closesAt(session) } : null,
    waiting: session ? await waitingIn(session.id) : [],
    awaiting: await Promise.all(awaiting.map(s => summarise(s, undefined, cashTaken))),
  }
})
