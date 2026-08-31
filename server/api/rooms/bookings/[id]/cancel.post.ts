import { and, eq, inArray } from 'drizzle-orm'
import { CANCELLABLE, refusalToCancel } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'

// Cancel a booking you hold.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''

  const booking = await bookingFor(id)
  // The same answer for a booking that is not yours and one that is not there: a member who may
  // not see a booking may not learn it exists either.
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'That is not your booking' })

  const refusal = refusalToCancel(booking, account.id)
  if (refusal) {
    throw createError({ statusCode: booking.userId === account.id ? 409 : 404, statusMessage: refusal })
  }

  // A status change, never a deletion, and guarded on the status it read: two cancels racing must
  // not both count as the one that freed the slot (0006, criterion 2).
  const changed = await db.update(schema.roomBookings)
    .set({ status: 'CANCELLED', updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(
      eq(schema.roomBookings.id, id),
      eq(schema.roomBookings.userId, account.id),
      inArray(schema.roomBookings.status, [...CANCELLABLE]),
    ))
    .returning({ id: schema.roomBookings.id })

  if (changed.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'That booking has already been decided' })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'room.booking.cancelled',
    target: `booking:${id}`,
    detail: { room: booking.roomId, was: booking.status },
  }))

  await notify(event, {
    type: 'room.booking.cancelled',
    userId: account.id,
    context: {
      name: account.name,
      room: booking.room,
      when: formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      title: booking.title,
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms`,
    },
  })

  return { ok: true, id, status: 'CANCELLED' as const, external: booking.isExternal }
})
