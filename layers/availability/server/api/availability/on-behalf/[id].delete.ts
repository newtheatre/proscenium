// A planner removes an entry they added for someone (rule A8); never one the person made.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteOnBehalf } from '../../../entries'

export default defineRoute({ ability: 'availability.entry.on-behalf', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await deleteOnBehalf(unit.view(), actor.accountId!, getRouterParam(event, 'id')!)
  return { deleted: true }
})
