// Presses of the door counter: one at a time online, or a batch saved while the device was offline
// (HC2). Each carries the id the device gave it, so a batch sent again counts nobody twice.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { takeTaps } from '../../../../../headcount'

const TAP_ID = /^hct_[2-7a-z]{26}$/ // not-policy: the id format, made on the device
const MOST = 500 // not-policy: shape bound, an evening's presses sent at once

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
    offline: z.boolean().optional(),
    items: z.array(z.discriminatedUnion('kind', [
      z.object({ kind: z.enum(['in', 'out']), id: z.string().regex(TAP_ID), quantity: z.number().int().min(1).max(50), at: z.number().int().nonnegative() }).strict(), // not-policy: the table's own bound
      z.object({ kind: z.literal('undo'), id: z.string().regex(TAP_ID), reversesId: z.string().regex(TAP_ID), at: z.number().int().nonnegative() }).strict(),
    ])).min(1).max(MOST),
  }).strict(),
}, async (_event, { input, record }) => takeTaps(record!.id!, input.items, { deviceLabel: input.deviceLabel ?? null, offline: !!input.offline }))
