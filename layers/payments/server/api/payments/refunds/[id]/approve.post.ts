// Approves a refund someone else asked for.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { approveRefund } from '../../../../refunds'

export default defineRoute({
  ability: 'payments.refund.approve',
  record: event => ['payments.refund', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  await approveRefund(unit.view(), record!.id, actor.accountId!)
  return { approved: true }
})
