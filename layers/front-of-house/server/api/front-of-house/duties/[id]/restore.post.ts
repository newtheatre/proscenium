// Brings an archived duty back, so an archive made by mistake is not final (FH-05).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { restoreDuty } from '../../../../rota'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  await restoreDuty(unit.view(), getRouterParam(event, 'id')!)
  return { dutyId: getRouterParam(event, 'id') }
})
