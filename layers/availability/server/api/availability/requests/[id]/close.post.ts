// The organiser closes a request by hand (rule R7). Reminders stop; entry never locks.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { closeByHand } from '../../../../requests'

export default defineRoute({ ability: 'availability.request.send', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await closeByHand(unit.view(), getRouterParam(event, 'id')!, actor)
  return { closed: true }
})
