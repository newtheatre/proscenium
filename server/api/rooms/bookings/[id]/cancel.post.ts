import { and, eq, inArray } from 'drizzle-orm'
import { CANCELLABLE, cancelForm, refusalToCancel } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'

// Cancel a booking you hold, or the series it belongs to.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, cancelForm)

  const booking = await bookingFor(id)
  // The same answer for a booking that is not yours and one that is not there: a member who may
  // not see a booking may not learn it exists either.
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'That is not your booking' })

  const refusal = refusalToCancel(booking, account.id)
  if (refusal) {
    throw createError({ statusCode: booking.userId === account.id ? 409 : 404, statusMessage: refusal })
  }

  // Asked, never assumed. A member cancelling one week must not lose a term to a button whose
  // meaning they had to infer (C-111 criterion 1).
  if (booking.seriesId && input.scope === null) {
    throw createError({
      statusCode: 422,
      statusMessage: 'That booking is part of a series, so say whether you mean this one or all of them',
      data: { seriesId: booking.seriesId, needsScope: true },
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const cancelled = booking.seriesId && input.scope === 'series'
    ? await cancelSeries(booking.seriesId, account.id, now)
    : await cancelOne(id, account.id, booking.seriesId, now)

  if (cancelled.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'That booking has already been decided' })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: input.scope === 'series' ? 'room.series.cancelled' : 'room.booking.cancelled',
    target: input.scope === 'series' ? `series:${booking.seriesId}` : `booking:${id}`,
    detail: { room: booking.roomId, was: booking.status, cancelled: cancelled.length },
  }))

  await tell(event, account, booking, cancelled)

  return {
    ok: true,
    id,
    status: 'CANCELLED' as const,
    scope: input.scope ?? 'occurrence',
    cancelled: cancelled.length,
  }
})

interface Cancelled { id: string, startsAt: number }

// A status change, never a deletion, and guarded on the status it read: two cancels racing must
// not both count as the one that freed the slot (0006, C-112 criterion 2).
async function cancelOne(id: string, userId: string, seriesId: string | null, now: number): Promise<Cancelled[]> {
  const cancel = db.update(schema.roomBookings)
    .set({ status: 'CANCELLED', updatedAt: now })
    .where(and(
      eq(schema.roomBookings.id, id),
      eq(schema.roomBookings.userId, userId),
      inArray(schema.roomBookings.status, [...CANCELLABLE]),
    ))
    .returning({ id: schema.roomBookings.id, startsAt: schema.roomBookings.startsAt })

  if (!seriesId) return cancel

  // Cancelling the first week moves the head, and it moves in the same batch: a series read
  // between the two would name a week that is already gone (C-111 criterion 3).
  const [cancelled] = await db.batch([cancel, promoteHead(seriesId, now)] as unknown as Parameters<typeof db.batch>[0])
  return cancelled as Cancelled[]
}

// Every occurrence still standing, resolved by the statement rather than by an id list built from
// a read: one predicate covers a term of any length (0003, 0006, C-111 criterion 2).
async function cancelSeries(seriesId: string, userId: string, now: number): Promise<Cancelled[]> {
  // Already decided occurrences are left exactly as they were, and the head follows what remains.
  const cancel = db.update(schema.roomBookings)
    .set({ status: 'CANCELLED', updatedAt: now })
    .where(and(
      eq(schema.roomBookings.seriesId, seriesId),
      eq(schema.roomBookings.userId, userId),
      inArray(schema.roomBookings.status, [...CANCELLABLE]),
    ))
    .returning({ id: schema.roomBookings.id, startsAt: schema.roomBookings.startsAt })

  const [cancelled] = await db.batch([cancel, promoteHead(seriesId, now)] as unknown as Parameters<typeof db.batch>[0])
  return cancelled as Cancelled[]
}

// One message naming which weeks went, never one per occurrence (C-111 criterion 5).
async function tell(
  event: Parameters<typeof notify>[0],
  account: { id: string, name: string },
  booking: { room: string, title: string, startsAt: number },
  cancelled: Cancelled[],
): Promise<void> {
  const base = useRuntimeConfig(event).public.baseURL

  if (cancelled.length === 1) {
    await notify(event, {
      type: 'room.booking.cancelled',
      userId: account.id,
      context: {
        name: account.name,
        room: booking.room,
        when: formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        title: booking.title,
        roomsUrl: `${base}/rooms`,
      },
    })
    return
  }

  await notify(event, {
    type: 'room.series.cancelled',
    userId: account.id,
    context: {
      name: account.name,
      room: booking.room,
      days: cancelled
        .sort((a, b) => a.startsAt - b.startsAt)
        .map(one => formatLondon(new Date(one.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })),
      roomsUrl: `${base}/rooms`,
    },
  })
}
