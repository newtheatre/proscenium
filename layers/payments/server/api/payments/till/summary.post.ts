// What the panels the seller has filled add up to. Reads only.
import { z } from 'zod'
import { defineRoute, Refusal } from '#kit'
import { sessionOf } from '../../../sessions'
import { tillSummary } from '../../../till'

export const panels = z.array(z.object({ basket: z.string().min(1).max(80), input: z.unknown() })).max(10) // not-policy: a till has a handful of panels

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
  input: z.object({ panels }).strict(),
}, async (_event, { input, actor }) => {
  const session = await sessionOf(actor.accountId!)
  if (!session) throw new Refusal('payments.session.none', 'Open a till session first.', { status: 409 })
  return tillSummary(actor, session.id, input.panels as { basket: string, input: unknown }[])
})
