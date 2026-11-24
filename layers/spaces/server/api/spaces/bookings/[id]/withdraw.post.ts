// The booker takes back a request before anyone decides it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { actingOn, withdrawRequest } from '../../../../changes'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor, unit }) => {
  const acting = await actingOn(actor, getRouterParam(event, 'id')!)
  withdrawRequest(unit.view(), acting, actor.accountId!)
  return { bookingId: acting.booking.id }
})
