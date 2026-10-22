import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { seriesPlace } from '#server/utils/room-writes'
import { z } from 'zod'

const query = z.object({
  // Past keeps every status, so a cancelled one is history; still to come, cancelled ones sit apart.
  when: z.enum(['upcoming', 'past', 'cancelled']).default('upcoming'),
})

// A moved booking is cancelled carrying a pointer, and stays with the live ones (C-123 criterion 5).
const WITHDRAWN = sql`(${schema.roomBookings.status} = 'CANCELLED' AND ${schema.roomBookings.convertedToRequestId} IS NULL)`

// The bookings this member holds.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)
  const now = Math.floor(Date.now() / 1000)
  const place = seriesPlace()

  const rows = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    title: schema.roomBookings.title,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    tier: schema.roomBookings.tier,
    purpose: schema.roomBookings.purpose,
    // Their own words, returned to them alone so the edit form opens filled in (C-108 criterion 4).
    notes: schema.roomBookings.notes,
    reason: schema.roomBookings.reason,
    rejectionReason: schema.roomBookings.rejectionReason,
    seriesId: schema.roomBookings.seriesId,
    occurrence: place.occurrence,
    seriesLength: place.length,
    seriesFrequency: schema.roomSeries.frequency,
    seriesWeekdays: schema.roomSeries.weekdays,
    bumpedReason: schema.roomBookings.bumpedReason,
    bumpedToBookingId: schema.roomBookings.bumpedToBookingId,
    // A cancellation carrying this was moved, not withdrawn, and must not read as cancelled.
    convertedToRequestId: schema.roomBookings.convertedToRequestId,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .leftJoin(schema.roomSeries, eq(schema.roomSeries.id, schema.roomBookings.seriesId))
    .where(and(
      eq(schema.roomBookings.userId, account.id),
      input.when === 'past' ? lt(schema.roomBookings.endsAt, now) : gte(schema.roomBookings.endsAt, now),
      input.when === 'upcoming' ? sql`NOT ${WITHDRAWN}` : undefined,
      input.when === 'cancelled' ? WITHDRAWN : undefined,
    ))
    .orderBy(input.when === 'past' ? desc(schema.roomBookings.startsAt) : asc(schema.roomBookings.startsAt))
    .limit(200)

  return {
    when: input.when,
    items: rows.map(row => ({
      ...row,
      cancellable: refusalToCancel({ userId: account.id, status: row.status }, account.id) === null,
      editable: refusalToEdit({ userId: account.id, status: row.status }, account.id) === null,
    })),
    total: rows.length,
  }
})
