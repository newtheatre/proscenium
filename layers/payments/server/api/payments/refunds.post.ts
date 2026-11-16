// Asks for a refund of one part from Payments' own screens. An owning module guards refunds of its
// own records with its own ability and calls requestRefund directly.
import { z } from 'zod'
import { defineRoute, idSchema } from '#kit'
import { requestRefund } from '../../refunds'

export default defineRoute({
  ability: 'payments.refund.request',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ partId: idSchema('pip'), amountMinor: z.number().int().positive(), attemptId: idSchema('att').optional() }).strict(),
}, async (_event, { input, actor, unit }) => requestRefund(unit.view(), { ...input, requestedBy: actor.accountId! }))
