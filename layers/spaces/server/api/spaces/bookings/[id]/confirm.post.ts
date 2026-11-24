// Confirms a request (SP-26, rule A4); for a room booked elsewhere, with its owner's reference (E2).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decideConfirm } from '../../../../decisions'

export default defineRoute({
  ability: 'spaces.booking.decide',
  record: event => ['spaces.booking', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().trim().max(500).nullish(), reference: z.string().trim().max(120).nullish() }).strict(), // not-policy: as the table's CHECKs
}, async (event, { actor, input, unit }) => {
  const booking = await decideConfirm(unit.view(), getRouterParam(event, 'id')!, actor.accountId!, { note: input.note ?? null, reference: input.reference ?? null })
  return { bookingId: booking.id }
})
