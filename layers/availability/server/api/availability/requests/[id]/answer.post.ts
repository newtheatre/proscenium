// "This is right" (rule R4): answers the request, changed or not.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { answer } from '../../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await answer(unit.view(), getRouterParam(event, 'id')!, actor.accountId!)
  return { answered: true }
})
