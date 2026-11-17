// The person keeps a place they had asked to give up, before anyone takes it (FH-13).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { keepPlace } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.sign-up',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  await keepPlace(unit.view(), getRouterParam(event, 'id')!, actor.accountId!)
  return { assignmentId: getRouterParam(event, 'id') }
})
