// "Remind now" (S11): everyone still asked, at most once a day, by the organiser.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { remindNow } from '../../../../requests'

export default defineRoute({ ability: 'availability.request.send', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) =>
  await remindNow(unit.view(), getRouterParam(event, 'id')!, actor))
