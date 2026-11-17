// Cancel tickets on an order (BO-50): the seats go back on sale and the tickets are void at the
// door. Refunding as well needs its own ability, which cancelling does not imply.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { cancelLines } from '../../../../cancel'

export default defineRoute({
  ability: 'box-office.order.cancel',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lineIds: z.array(z.string()).min(1).max(50).optional(), // not-policy: more lines than any order holds
    refund: z.enum(['full', 'less-fee', 'none']),
    reasonTermId: z.string().optional(),
    note: z.string().trim().max(200).optional(), // not-policy: the column's own limit
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  if (input.refund !== 'none') await requireAbility(actor, 'box-office.order.refund', ['box-office.order', record!.id!])
  return cancelLines(unit.view(), record!.id!, { ...input, by: actor.accountId! })
})
