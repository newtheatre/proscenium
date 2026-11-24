// Closes a session being counted, with the cash counted and, for any difference, the reason.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { can, defineRoute, Refusal } from '#kit'
import { closeSession, getSession, summarise } from '../../../../sessions'

export default defineRoute({
  // Your own session needs payments.session.open; anyone else's needs payments.session.close-any.
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    countedMinor: z.number().int().min(0),
    varianceNote: z.string().trim().max(200).optional(), // not-policy: the column's own limit
  }).strict(),
}, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const session = await getSession(id)
  if (!session) throw new Refusal('core.not-found', 'There is no such session.', { status: 404 })
  const canCloseAny = (await can(actor, 'payments.session.close-any', { type: 'payments.session', id: session.id })).allowed
  if (!canCloseAny && !(await can(actor, 'payments.session.open')).allowed) throw new Refusal('core.access.denied', 'You cannot close till sessions.', { status: 403 })
  const { varianceMinor } = await closeSession(unit.view(), session, { countedMinor: input.countedMinor, varianceNote: input.varianceNote, by: actor.accountId!, canCloseAny })
  unit.audit({ action: 'update', record: ['payments.session', session.id] })
  await unit.commit()
  return { session: await summarise((await getSession(session.id))!), varianceMinor }
})
