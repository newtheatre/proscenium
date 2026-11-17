// What the panels the seller has filled add up to. Reads only, and needs no open session: the
// session opens with the first sale.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { tillSummary } from '../../../till'

export const panels = z.array(z.object({ basket: z.string().min(1).max(80), input: z.unknown() })).max(10) // not-policy: a till has a handful of panels

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
  input: z.object({ panels }).strict(),
}, async (_event, { input, actor }) => {
  return tillSummary(actor, input.panels as { basket: string, input: unknown }[])
})
