// Publishes chosen draft shifts together, from the Rota page's bulk action (FH-07).
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { getShift, type Shift } from '../../../shifts'
import { publishShifts } from '../../../rota'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ shiftIds: z.array(z.string().min(1).max(40)).min(1).max(200) }).strict(), // not-policy: shape bound
}, async (_event, { input, unit }) => {
  const shifts = (await Promise.all(input.shiftIds.map(id => getShift(id)))).filter((s): s is Shift => !!s)
  if (shifts.length !== input.shiftIds.length) refuse('core.not-found', 'One of these shifts does not exist.', { status: 404 })
  await publishShifts(unit.view(), shifts)
  return { published: shifts.length }
})
