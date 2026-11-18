// Prepares every filled panel and opens one payment for the total in my open session.
import { z } from 'zod'
import { defineRoute, Refusal } from '#kit'
import { sessionOf } from '../../../sessions'
import { prepareSale } from '../../../till'
import { panels } from './summary.post'
import { receiptTo, resolveReceipt } from '../../../receipt-input'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    panels,
    // Split between people by item: for each person, how many of each summary line are theirs.
    splits: z.array(z.object({
      items: z.array(z.object({ basket: z.string().min(1).max(80), line: z.number().int().min(0).max(500), quantity: z.number().int().positive().max(500) }).strict()).min(1).max(500), // not-policy: bounds on a receipt's size
    }).strict()).min(2).max(100).optional(), // not-policy: bounds on a receipt's size
    // Where the whole sale's receipt goes; a split sale's are given person by person as they pay.
    receipt: receiptTo.optional(),
  }).strict(),
}, async (_event, { input, actor, unit }) => {
  const session = await sessionOf(actor.accountId!)
  if (!session || session.state !== 'open') throw new Refusal('payments.session.none', 'Open a till session first.', { status: 409 })
  return prepareSale(unit.view(), actor, session.id, input.panels as { basket: string, input: unknown }[], input.splits, await resolveReceipt(input.receipt))
})
