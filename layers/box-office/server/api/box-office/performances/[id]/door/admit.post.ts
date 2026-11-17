// Admit tickets from the door list, for a buyer found by name or reference with no ticket to scan
// (Box office specification, part 6, "The door"). Admits up to the number asked of the order's
// tickets for this performance not yet in, and says how many went in.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { admitByName } from '../../../../../door'

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    orderId: z.string().min(1).max(64), // not-policy: shape bound
    count: z.number().int().min(1).max(500), // not-policy: shape bound
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
  }).strict(),
}, (_event, { input, record }) => admitByName({ performanceId: record!.id!, orderId: input.orderId, count: input.count, deviceLabel: input.deviceLabel }))
