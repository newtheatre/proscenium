// Make some tickets on a reservation complimentary from the till's swap menu, where comps need no approval.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { compReservationLines } from '../../../../comps'

export default defineRoute({
  // Asking for complimentary tickets is checked inside, against the performance.
  ability: 'box-office.order.take-payment',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lineIds: z.array(z.string().min(1).max(64)).min(1).max(50), // not-policy: more lines than any order holds
    reasonTermId: z.string().min(1).max(64), // not-policy: shape bound
  }).strict(),
}, async (_event, { input, record, unit }) => compReservationLines(unit.view(), record!.id!, input.lineIds, input.reasonTermId))
