// Withdraws a request nothing has been spent against: by whoever asked, or a holder of the budget.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireRequest, withdraw } from '../../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const request = await requireRequest(getRouterParam(event, 'id'))
  await withdraw(unit, actor, request)
  return { requestId: request.id }
})
