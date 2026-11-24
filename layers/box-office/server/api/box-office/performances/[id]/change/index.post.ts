// Records what happens to the bookings when the performance is next cancelled, rescheduled or moved
// (BO-52, BO-53). The core's change then goes through, and its event carries the decision out.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { decide } from '../../../../../change'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ decision: z.enum(['refund_all', 'offer_exchange', 'keep']) }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await decide(unit.view(), record!.id!, input.decision, actor.accountId!)
  return { decision: input.decision }
})
