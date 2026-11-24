// Declines a request with a note the requester sees (BC-16).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decide, requireRequest } from '../../../../requests'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ note: z.string().trim().min(1).max(500) }).strict(), // not-policy: the column's bound
}, async (event, { input, unit, actor }) => {
  const request = await requireRequest(getRouterParam(event, 'id'))
  await decide(unit, actor, request, { approve: false, note: input.note })
  return { requestId: request.id }
})
