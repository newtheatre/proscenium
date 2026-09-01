import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { z } from 'zod'

const query = z.object({
  // Past bookings stay visible with their status, so a cancelled one is history rather than gone.
  when: z.enum(['upcoming', 'past']).default('upcoming'),
})

// The bookings this member holds.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)
  const now = Math.floor(Date.now() / 1000)

  const rows = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    isExternal: schema.rooms.isExternal,
    title: schema.roomBookings.title,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    tier: schema.roomBookings.tier,
    rejectionReason: schema.roomBookings.rejectionReason,
    seriesId: schema.roomBookings.seriesId,
    occurrence: schema.roomBookings.occurrence,
    seriesLength: schema.roomSeries.occurrences,
    bumpedReason: schema.roomBookings.bumpedReason,
    bumpedToBookingId: schema.roomBookings.bumpedToBookingId,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .leftJoin(schema.roomSeries, eq(schema.roomSeries.id, schema.roomBookings.seriesId))
    .where(and(
      eq(schema.roomBookings.userId, account.id),
      input.when === 'upcoming' ? gte(schema.roomBookings.endsAt, now) : lt(schema.roomBookings.endsAt, now),
    ))
    .orderBy(input.when === 'upcoming' ? asc(schema.roomBookings.startsAt) : desc(schema.roomBookings.startsAt))
    .limit(200)

  return {
    when: input.when,
    items: rows.map(row => ({ ...row, cancellable: refusalToCancel({ userId: account.id, status: row.status }, account.id) === null })),
    total: rows.length,
  }
})
