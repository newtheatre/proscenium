// F8: the organiser gives the poll up.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { abandon } from '../../../../polls'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await abandon(unit.view(), getRouterParam(event, 'id')!, actor)
  return { abandoned: true }
})
