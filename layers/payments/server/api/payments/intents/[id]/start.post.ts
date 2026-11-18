// Starts a payment with an integrated provider for a desk sale, such as a card reader.
import { z } from 'zod'
import { receiptTo, resolveReceipt } from '../../../../receipt-input'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema, siteOrigin } from '#kit'
import { RETURN_PATH, startAttempt } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    providerAccountId: idSchema('ppa'),
    method: z.enum(['card_online', 'card_reader']),
    readerId: idSchema('rdr').optional(),
    // A split sale is paid one person at a time, each for their own items; no amount is typed.
    split: z.number().int().positive().max(100).optional(), // not-policy: a person's number on the receipt
    receipt: receiptTo.optional(),
    // The screen to come back to after a hand-off to another app, such as the till.
    returnTo: z.string().max(200).regex(RETURN_PATH).optional(), // not-policy: a path's bound
  }).strict(),
}, async (event, { input }) => startAttempt(getRouterParam(event, 'id') ?? '', { ...input, receipt: await resolveReceipt(input.receipt), origin: await siteOrigin() }))
