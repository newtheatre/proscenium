// Cancels a booking (rules X4 and X5). Staff say why, and the booker is told.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { notify } from '#modules/core'
import { actingOn, cancelBooking } from '../../../../changes'
import { bookingWords } from '../../../../words'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().trim().max(500).nullish() }).strict(), // not-policy: as the table's CHECK
}, async (event, { actor, input, unit }) => {
  const acting = await actingOn(actor, getRouterParam(event, 'id')!)
  const { late } = await cancelBooking(unit.view(), acting, actor.accountId!, input.note ?? null)
  if (!acting.own) await notify(unit.view(), 'spaces.booking-cancelled', { to: acting.booking.bookedFor, variables: { ...await bookingWords(acting.booking.id), note: input.note!.trim() }, dedupeKey: `cancelled:${acting.booking.id}`, subject: ['spaces.booking', acting.booking.id] })
  return { bookingId: acting.booking.id, late }
})
