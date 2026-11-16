// Prepares every filled panel and opens one payment for the total in my open session.
import { z } from 'zod'
import { defineRoute, Refusal } from '#kit'
import { sessionOf } from '../../../sessions'
import { prepareSale } from '../../../till'
import { panels } from './summary.post'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ panels }).strict(),
}, async (_event, { input, actor, unit }) => {
  const session = await sessionOf(actor.accountId!)
  if (!session || session.state !== 'open') throw new Refusal('payments.session.none', 'Open a till session first.', { status: 409 })
  return prepareSale(unit.view(), actor, session.id, input.panels as { basket: string, input: unknown }[])
})
