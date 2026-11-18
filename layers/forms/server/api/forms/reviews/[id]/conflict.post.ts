// A reviewer declares a conflict of interest (FB-406). No reason is asked. Anything they had
// written goes, and from this moment every route refuses them that response.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { declareConflict, ownAssignment } from '../../../../review'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { actor, unit }) => {
  const { assignment } = await ownAssignment(getRouterParam(event, 'id') ?? '', actor)
  declareConflict(unit, assignment)
  return { ok: true }
})
