// Declines a requested refund, with a reason from the theatre's list.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { declineRefund } from '../../../../refunds'

export default defineRoute({
  ability: 'payments.refund.approve',
  record: event => ['payments.refund', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ reasonTermId: idSchema('trm') }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  declineRefund(unit.view(), record!.id, actor.accountId!, input.reasonTermId)
  return { declined: true }
})
