// Admissions made on a device while it was offline, sent when it reconnects (D2, box office review).
// Each carries the id the device gave it, so a batch sent again after a lost answer admits nobody
// twice. The answer says, for each, what the server made of it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { takeOffline } from '../../../../../door-offline'

const SCAN_ID = /^scan_[2-7a-z]{26}$/ // not-policy: the id format, made on the device
const MOST = 500 // not-policy: shape bound, a full house sent at once

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
    items: z.array(z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('code'), id: z.string().regex(SCAN_ID), code: z.string().min(1).max(300), at: z.number().int().nonnegative() }).strict(), // not-policy: shape bound
      z.object({ kind: z.literal('name'), ids: z.array(z.string().regex(SCAN_ID)).min(1).max(50), orderId: z.string().min(1).max(40), at: z.number().int().nonnegative() }).strict(), // not-policy: shape bound
    ])).min(1).max(MOST),
  }).strict(),
}, async (_event, { input, record }) => ({ results: await takeOffline(record!.id!, input.items, input.deviceLabel ?? null) }))
