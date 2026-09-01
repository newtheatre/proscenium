import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { calendarFor } from '#shared/utils/ics'

// A member's own bookings, as a calendar their phone can subscribe to. The token in the URL is
// the whole authorisation, so it grants that one member's bookings and nothing else.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const holder = await feedHolder(token)
  // The same answer for a revoked token and one that never existed.
  if (!holder) throw createError({ statusCode: 404, statusMessage: 'No such calendar' })

  const now = Math.floor(Date.now() / 1000)
  const horizon = await configValue(event, 'ROOM_FEED_WEEKS')

  const rows = await db.select({
    id: schema.roomBookings.id,
    title: schema.roomBookings.title,
    room: schema.rooms.name,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    updatedAt: schema.roomBookings.updatedAt,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(and(
      eq(schema.roomBookings.userId, holder.userId),
      gte(schema.roomBookings.endsAt, now),
      sql`${schema.roomBookings.startsAt} < ${now + horizon * 7 * 24 * 3600}`,
      // A cancelled booking is still sent, marked cancelled, so a client that already holds it
      // strikes it out rather than leaving a rehearsal on somebody's phone (criterion 5).
      inArray(schema.roomBookings.status, ['CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED']),
    ))
    .orderBy(schema.roomBookings.startsAt)

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', 'inline; filename="nnt-rooms.ics"')
  // A subscription is polled, so a stale copy is worse than a fetch.
  setHeader(event, 'cache-control', 'no-store, private')

  return calendarFor(rows, {
    name: 'New Theatre rooms',
    host: new URL(useRuntimeConfig(event).public.baseURL).hostname,
  })
})
