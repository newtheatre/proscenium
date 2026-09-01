import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import { formatLondon, fromLondonWallClock, londonParts } from '#shared/utils/london'
import { calendarFor } from '#shared/utils/ics'
import type { H3Event } from 'h3'

// The day-before reminder (C-113 criterion 3). The old app had no clockwork of any kind, so
// nothing was ever reminded and a booked room sat empty (RM-1).

export interface ReminderRun { members: number, bookings: number, skipped: number }

// The London day after the one `at` falls in, as the instants that bound it (0014).
function tomorrowBounds(at: Date): { from: number, to: number } {
  const { year, month, day } = londonParts(at)
  const from = fromLondonWallClock(year, month, day + 1)
  const to = fromLondonWallClock(year, month, day + 2)
  return { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000) }
}

// Already told today, read from the log rather than a column: the log is the record criterion 5
// requires anyway, so a task run twice cannot send twice.
async function alreadyToldToday(userId: string, at: Date): Promise<boolean> {
  const { year, month, day } = londonParts(at)
  const since = Math.floor(fromLondonWallClock(year, month, day).getTime() / 1000)

  const [row] = await db.select({ id: schema.notificationLog.id })
    .from(schema.notificationLog)
    .where(and(
      eq(schema.notificationLog.userId, userId),
      eq(schema.notificationLog.type, 'room.booking.reminder'),
      gte(schema.notificationLog.createdAt, since),
    ))
    .limit(1)

  return row !== undefined
}

export async function remindTomorrow(event: H3Event | undefined, at = new Date()): Promise<ReminderRun> {
  const { from, to } = tomorrowBounds(at)

  const rows = await db.select({
    id: schema.roomBookings.id,
    userId: schema.roomBookings.userId,
    room: schema.rooms.name,
    title: schema.roomBookings.title,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    updatedAt: schema.roomBookings.updatedAt,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(and(
      eq(schema.roomBookings.status, 'CONFIRMED'),
      gte(schema.roomBookings.startsAt, from),
      lt(schema.roomBookings.startsAt, to),
    ))
    .orderBy(asc(schema.roomBookings.startsAt))

  // A room the union gave us is a room somebody has to turn up to, so it is reminded about like
  // any other. Only a confirmed one: the rest may still not happen (C-120).
  const union = await db.select({
    id: schema.externalRequests.id,
    userId: schema.externalRequests.userId,
    room: schema.externalSpaces.name,
    title: schema.externalRequests.title,
    startsAt: schema.externalRequests.startsAt,
    endsAt: schema.externalRequests.endsAt,
    status: schema.externalRequests.status,
    updatedAt: schema.externalRequests.updatedAt,
  })
    .from(schema.externalRequests)
    .innerJoin(schema.externalSpaces, eq(schema.externalSpaces.id, schema.externalRequests.assignedSpaceId))
    .where(and(
      eq(schema.externalRequests.status, 'CONFIRMED'),
      gte(schema.externalRequests.startsAt, from),
      lt(schema.externalRequests.startsAt, to),
    ))
    .orderBy(asc(schema.externalRequests.startsAt))

  // One message per member however many rooms they hold tomorrow, ours and the union's alike
  // (criterion 2).
  const held = [...rows, ...union].sort((a, b) => a.startsAt - b.startsAt)
  const byMember = new Map<string, typeof held>()
  for (const row of held) byMember.set(row.userId, [...(byMember.get(row.userId) ?? []), row])

  const base = useRuntimeConfig(event).public.baseURL
  let members = 0
  let skipped = 0

  for (const [userId, held] of byMember) {
    if (await alreadyToldToday(userId, at)) {
      skipped++
      continue
    }

    await notify(event, {
      type: 'room.booking.reminder',
      userId,
      context: {
        name: '',
        bookings: held.map(booking => ({
          room: booking.room,
          title: booking.title,
          when: formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        })),
        roomsUrl: `${base}/rooms/mine`,
      },
      // Everything they hold tomorrow in one file, so accepting it fills the evening in.
      attachments: [{
        filename: 'tomorrow.ics',
        contentType: 'text/calendar; charset=utf-8',
        content: calendarFor(held, { name: 'New Theatre rooms', host: new URL(base).hostname }),
      }],
    })
    members++
  }

  return { members, bookings: held.length, skipped }
}

// What the operations dashboard reads: a send that failed or was suppressed, newest first.
export async function recentDeliveryTrouble(limit = 20): Promise<{ id: string, type: string, status: string, error: string | null, who: string | null, at: number }[]> {
  return db.select({
    id: schema.notificationLog.id,
    type: schema.notificationLog.type,
    status: schema.notificationLog.status,
    error: schema.notificationLog.error,
    who: schema.users.name,
    at: schema.notificationLog.createdAt,
  })
    .from(schema.notificationLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.notificationLog.userId))
    .where(sql`${schema.notificationLog.status} <> 'SENT'`)
    .orderBy(sql`${schema.notificationLog.createdAt} desc`)
    .limit(limit)
}
