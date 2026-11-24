// Records that a request for a room booked elsewhere has been put to its owner (SP-30, rule E2).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { markPlaced } from '../../../../decisions'

export default defineRoute({
  ability: 'spaces.booking.decide',
  record: event => ['spaces.booking', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  await markPlaced(unit.view(), getRouterParam(event, 'id')!, actor.accountId!)
  return { bookingId: getRouterParam(event, 'id')! }
})
