// Publishes a draft shift, so members can see it and sign up (FH-07, the part the gate needs).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { getShift, publishShift } from '../../../../shifts'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  const shift = await getShift(record!.id!)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  publishShift(unit.view(), shift)
  return { shiftId: shift.id }
})
