// Archives a duty: it takes no new shifts, and the shifts it has carry on.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveDuty } from '../../../../rota'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (event, { unit }) => {
  archiveDuty(unit.view(), getRouterParam(event, 'id')!)
  return { dutyId: getRouterParam(event, 'id') }
})
