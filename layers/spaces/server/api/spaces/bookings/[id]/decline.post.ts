// Declines a request with a note the booker is sent (SP-26, rule A4).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decideDecline } from '../../../../decisions'

export default defineRoute({
  ability: 'spaces.booking.decide',
  record: event => ['spaces.booking', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().max(500).nullish() }).strict(), // not-policy: as the table's CHECK
}, async (event, { actor, input, unit }) => {
  const booking = await decideDecline(unit.view(), getRouterParam(event, 'id')!, actor.accountId!, input.note ?? null)
  return { bookingId: booking.id }
})
