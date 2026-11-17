// Cancels a shift with a reason. Everyone on it is released and told.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { getShift } from '../../../../shifts'
import { cancelShift } from '../../../../rota'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ reason: z.string().trim().min(1).max(200) }).strict(), // not-policy: shape bound, as the table's CHECK
}, async (_event, { input, record, actor, unit }) => {
  const shift = await getShift(record!.id!)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  await cancelShift(unit.view(), shift, { reason: input.reason, by: actor.accountId! })
  return { shiftId: shift.id }
})
