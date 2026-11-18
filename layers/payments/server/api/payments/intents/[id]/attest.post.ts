// Records a cash or card machine payment at the desk, in the seller's open session.
import { z } from 'zod'
import { receiptTo, resolveReceipt } from '../../../../receipt-input'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { attest } from '../../../../attest'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    providerAccountId: idSchema('ppa'),
    method: z.enum(['cash', 'card_attested', 'other_attested']),
    // A split sale is paid one person at a time, each for their own items; no amount is typed.
    split: z.number().int().positive().max(100).optional(), // not-policy: a person's number on the receipt
    receipt: receiptTo.optional(),
    tenderedMinor: z.number().int().positive().optional(),
    note: z.string().max(200).optional(), // not-policy: the column's limit
    succeeded: z.boolean().optional(),
  }).strict(),
}, async (event, { input }) => attest({ intentId: getRouterParam(event, 'id') ?? '', ...input, receipt: await resolveReceipt(input.receipt) }))
