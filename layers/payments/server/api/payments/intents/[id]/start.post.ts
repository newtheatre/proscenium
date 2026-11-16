// Starts a payment with an integrated provider for a desk sale, such as a card reader.
import { z } from 'zod'
import { getRequestURL, getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { startAttempt } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    providerAccountId: idSchema('ppa'),
    method: z.enum(['card_online', 'card_reader']),
    readerId: idSchema('rdr').optional(),
    amountMinor: z.number().int().positive().optional(),
  }).strict(),
}, async (event, { input }) => startAttempt(getRouterParam(event, 'id') ?? '', { ...input, origin: getRequestURL(event).origin }))
