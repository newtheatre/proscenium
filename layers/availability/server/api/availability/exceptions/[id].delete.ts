// Removes one of my entries; days before today stay as they were (AV-03, rule A3).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteException } from '../../../entries'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, async (event, { actor, unit }) => {
  await deleteException(unit.view(), actor.accountId!, getRouterParam(event, 'id')!)
  return { deleted: true }
})
