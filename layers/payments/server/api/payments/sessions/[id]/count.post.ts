// Starts cashing up: no more payments, and the cash expected is fixed. Refused while a payment in
// the session is still waiting for its answer.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { can, defineRoute, first, Refusal } from '#kit'
import { getSession, startCount, summarise } from '../../../../sessions'
import { inAccountScope } from '../../../../account-scope'

export default defineRoute({
  // Your own session needs payments.session.open; anyone else's needs payments.session.close-any.
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  const session = await getSession(id)
  if (!session) throw new Refusal('core.not-found', 'There is no such session.', { status: 404 })
  const scope = inAccountScope('opened_by', actor.accountId!)
  const own = await first('SELECT 1 FROM payments_sessions WHERE id = ? AND ' + scope.sql, session.id, ...scope.params)
  const allowed = own ? await can(actor, 'payments.session.open') : await can(actor, 'payments.session.close-any', { type: 'payments.session', id: session.id })
  if (!allowed.allowed)
    throw new Refusal('core.access.denied', 'Only the person who opened this session, or someone allowed to close any, may cash it up.', { status: 403 })
  await startCount(unit.view(), session)
  await unit.commit()
  return { session: await summarise((await getSession(session.id))!) }
})
