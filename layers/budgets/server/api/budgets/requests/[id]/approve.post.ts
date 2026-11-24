// Approves a request (BC-16). Who may is the service's to say: a holder of its budget who did not ask, or the treasurer.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decide, requireRequest } from '../../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const request = await requireRequest(getRouterParam(event, 'id'))
  await decide(unit, actor, request, { approve: true })
  return { requestId: request.id }
})
