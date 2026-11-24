// I5: disconnecting deletes the connection and its imported times at once.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { disconnect } from '../../../../calendars'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await disconnect(unit.view(), getRouterParam(event, 'id')!, actor.accountId!)
  return { disconnected: true }
})
