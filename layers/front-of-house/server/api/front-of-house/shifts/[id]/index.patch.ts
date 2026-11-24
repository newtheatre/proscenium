// Changes a shift's places, times or briefing. People on it are told of a new call time.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { getShift } from '../../../../shifts'
import { updateShift } from '../../../../rota'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['front-of-house.shift', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({
    places: z.number().int().min(1).max(50).optional(), // not-policy: shape bound, as the table's CHECK
    callAt: z.number().int().positive().optional(),
    endsAt: z.number().int().positive().optional(),
    briefing: z.string().trim().max(1000).nullish(), // not-policy: shape bound, as the table's CHECK
    signUp: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, record, unit }) => {
  const shift = await getShift(record!.id!)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  await updateShift(unit.view(), shift, input)
  return { shiftId: shift.id }
})
