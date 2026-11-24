// I5: "Refresh now", at most once a minute.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { refreshNow } from '../../../../calendars'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => ({
  state: await refreshNow(unit.view(), getRouterParam(event, 'id')!, actor.accountId!),
}))
