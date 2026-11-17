// Moves a till session to another space, changes its note, or, before the first cash is taken, its
// float. Your own session not yet closed needs payments.session.open; anyone else's, or a closed
// one, needs payments.session.close-any.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { can, defineRoute, first, Refusal } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getSession, placeSession, summarise } from '../../../../sessions'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    spaceId: z.string().max(40).nullable().optional(), // not-policy: an id's length
    pointLabel: z.string().trim().max(60).optional(), // not-policy: the note's length, as on opening
    floatMinor: z.number().int().min(0).optional(),
  }).strict(),
}, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  const session = await getSession(id)
  if (!session) throw new Refusal('core.not-found', 'There is no such session.', { status: 404 })
  const own = !!(await first(`SELECT 1 FROM payments_sessions WHERE id = ?1 AND opened_by IN (${accountScopeSql('?2')})`, session.id, actor.accountId!))
  const allowed = own && session.state !== 'closed'
    ? await can(actor, 'payments.session.open')
    : await can(actor, 'payments.session.close-any', { type: 'payments.session', id: session.id })
  if (!allowed.allowed) throw new Refusal('core.access.denied', 'Only the person who opened this session, or someone allowed to close any, may change it.', { status: 403 })
  await placeSession(unit.view(), session, input)
  unit.audit({ action: 'update', record: ['payments.session', session.id] })
  await unit.commit()
  return { session: await summarise((await getSession(session.id))!) }
})
