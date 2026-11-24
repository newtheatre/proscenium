// Deletes one of my patterns and its lines (AV-02).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deletePattern } from '../../../entries'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await deletePattern(unit.view(), actor.accountId!, getRouterParam(event, 'id')!)
  return { deleted: true }
})
