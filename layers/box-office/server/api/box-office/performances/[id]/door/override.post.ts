// "Admit anyway" (R-30): a ticket whose requirement was not met at the entry recheck, admitted by a
// holder of the override with a reason from the theatre's list, audited, never on their own order.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { admitAnyway } from '../../../../../door'

export default defineRoute({
  ability: 'box-office.ticket-type.override-requirement',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    ticketId: z.string().min(1).max(64), // not-policy: shape bound
    reasonTermId: z.string().min(1).max(64), // not-policy: shape bound
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
  }).strict(),
}, (_event, { input, record }) => admitAnyway({ performanceId: record!.id!, ticketId: input.ticketId, reasonTermId: input.reasonTermId, deviceLabel: input.deviceLabel }))
