import { eq, sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { roomBookingsList } from '#shared/utils/room-bookings-list'
import { bookingsClause, standingNoShow } from '#server/utils/room-bookings-list'

const query = filterQuerySchema(roomBookingsList)

// Every member's room bookings, for the officer who bumps one or marks a no-show (C-115
// criterion 6, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const { where, orderBy } = bookingsClause(input, Math.floor(Date.now() / 1000))

  // An allow-list: the member's name and nothing else about them, and none of the free text a
  // member wrote on the booking (C-115 criterion 6, 0011).
  const items = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    userId: schema.roomBookings.userId,
    member: schema.users.name,
    title: schema.roomBookings.title,
    tier: schema.roomBookings.tier,
    purpose: schema.roomBookings.purpose,
    status: schema.roomBookings.status,
    convertedToRequestId: schema.roomBookings.convertedToRequestId,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    noShowId: standingNoShow,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(where)

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
