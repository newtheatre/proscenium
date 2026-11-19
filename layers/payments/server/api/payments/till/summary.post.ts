// What the panels the seller has filled add up to. Reads only, and needs no open session: the
// session opens with the first sale.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { tillSummary } from '../../../till'

export const panels = z.array(z.object({ basket: z.string().min(1).max(80), input: z.unknown() })).max(10) // not-policy: a till has a handful of panels
// What the seller added to the whole sale: codes the customer gave, promotions picked from the till's list.
export const pricing = z.object({
  codes: z.array(z.string().trim().min(1).max(40)).max(5).optional(), // not-policy: longer than any code; more codes than one sale takes
  staff: z.array(z.object({ promotionId: z.string().min(1).max(64), reason: z.string().trim().min(1).max(200).optional() }).strict()).max(5).optional(), // not-policy: an id; one line; more than one sale takes
}).strict()

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
  input: z.object({ panels, pricing: pricing.optional() }).strict(),
}, async (_event, { input, actor }) => {
  return tillSummary(actor, input.panels as { basket: string, input: unknown }[], input.pricing)
})
