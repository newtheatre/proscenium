// "I'm here", or a lead marking someone else arrived (FH-21). Only inside the shift's window.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse, requireAbility } from '#kit'
import { checkIn } from '../../../../night'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id')!
  const row = await first<{ account_id: string }>('SELECT account_id FROM front_of_house_assignments WHERE id = ?', id)
  if (!row) refuse('core.not-found', 'There is no such place on a shift.', { status: 404 })
  if (row.account_id !== actor.accountId) await requireAbility(actor, 'front-of-house.assignment.check-in', ['front-of-house.assignment', id])
  await checkIn(unit.view(), id)
  return { checkedIn: true }
})
