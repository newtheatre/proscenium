// Split tickets off a reservation into one of their own, so one of a group can pay for theirs while
// the rest stay reserved. The answer names the new reservation, which the till then takes payment for.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { splitReservation } from '../../../../desk'

export default defineRoute({
  ability: 'box-office.order.take-payment',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lineIds: z.array(z.string().min(1).max(64)).min(1).max(50), // not-policy: more lines than any order holds
  }).strict(),
}, async (_event, { input, record, actor, unit }) => splitReservation(unit.view(), record!.id!, input.lineIds, actor.accountId!))
