// Enters a provider's payout and the fees it kept, from its statement (PAY-06).
import { z } from 'zod'
import { defineRoute, idSchema } from '#kit'
import { recordPayout } from '../../payouts'

export default defineRoute({
  ability: 'payments.provider.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    providerAccountId: idSchema('ppa'),
    paidMinor: z.number().int().min(0),
    feesMinor: z.number().int().min(0),
    paidOn: z.iso.date(),
    reference: z.string().trim().min(1).max(120), // not-policy: a provider's payout reference fits well within this
  }).strict(),
}, async (_event, { input, actor, unit }) => ({ postingId: await recordPayout(unit.view(), { ...input, by: actor.accountId! }) }))
