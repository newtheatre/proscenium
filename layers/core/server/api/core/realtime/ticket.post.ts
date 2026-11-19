// A ticket to a realtime room (#kit/realtime), for the page to open /api/realtime with: my account's
// own room, or with `grant` the room that grant is a pass to. `available` is false where this
// Worker cannot push, so the page keeps to its ordinary reads.
import { z } from 'zod'
import { defineRoute, nowMs, Refusal } from '#kit'
import { grantTicket, ownTicket, realtimeAvailable } from '#kit/realtime'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ grant: z.string().max(2000).optional() }).strict(), // not-policy: a grant's length
}, async (_event, { input, actor }) => {
  if (!realtimeAvailable()) return { available: false, ticket: null }
  if (!input.grant) return { available: true, ticket: await ownTicket(actor.accountId!, actor.sessionId ?? null, nowMs()) }
  const ticket = await grantTicket(input.grant, actor.accountId!, actor.sessionId ?? null, nowMs())
  if (!ticket) throw new Refusal('core.realtime.grant-refused', 'This link has ended.', { status: 403, remedy: 'Link the devices again.' })
  return { available: true, ticket }
})
