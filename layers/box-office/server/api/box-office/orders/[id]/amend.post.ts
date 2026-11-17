// Change a reservation before taking payment (R-4): tickets off, tickets on, or a ticket's type.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { amendReservation } from '../../../../desk'

const ids = z.array(z.string()).max(50) // not-policy: more lines than any order holds

export default defineRoute({
  ability: 'box-office.order.take-payment',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    remove: ids.optional(),
    add: z.array(z.object({ bandId: z.string(), ticketTypeId: z.string(), quantity: z.number().int().min(1).max(500) }).strict()).max(50).optional(), // not-policy: the settings' own ceilings
    retype: z.array(z.object({ lineId: z.string(), ticketTypeId: z.string() }).strict()).max(50).optional(), // not-policy: more lines than any order holds
  }).strict().refine(i => (i.remove?.length ?? 0) + (i.add?.length ?? 0) + (i.retype?.length ?? 0) > 0, 'Nothing to change'),
}, async (_event, { input, record, actor, unit }) => amendReservation(unit.view(), record!.id!, input, actor.accountId!))
