// Starts a payment with an integrated provider for a desk sale, such as a card reader.
import { z } from 'zod'
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
    amountMinor: z.number().int().positive().optional(),
    // The screen to come back to after a hand-off to another app, such as the till.
    returnTo: z.string().max(200).regex(RETURN_PATH).optional(), // not-policy: a path's bound
  }).strict(),
}, async (event, { input }) => startAttempt(getRouterParam(event, 'id') ?? '', { ...input, origin: await siteOrigin() }))
