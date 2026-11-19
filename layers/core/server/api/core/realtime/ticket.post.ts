// A ticket to my account's realtime room (#kit/realtime), for the page to open /api/realtime with.
// `available` is false where this Worker cannot push, so the page keeps to its ordinary reads.
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { ownTicket, realtimeAvailable } from '#kit/realtime'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  if (!realtimeAvailable()) return { available: false, ticket: null }
  return { available: true, ticket: await ownTicket(actor.accountId!, actor.sessionId ?? null, nowMs()) }
})
