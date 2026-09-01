import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { coversRoom } from '#shared/utils/blackouts'
import { z } from 'zod'
import { HOLDS_A_SLOT, maskConflicts } from '#shared/utils/bookings'
import { planWindow } from '#shared/utils/availability'
import type { Conflict } from '#shared/utils/bookings'

const query = z.object({
  from: z.string().max(10),
  to: z.string().max(10),
  roomId: z.string().max(64).optional(),
})

// What is taken across a span, per room.
export default defineEventHandler(async (event) => {
  const { account, permissions } = await authority(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const window = planWindow(input.from, input.to)
  if (!window.ok) throw createError({ statusCode: 400, statusMessage: window.why })

  const rooms = (await listRooms(false)).filter(room => !input.roomId || room.id === input.roomId)
  if (input.roomId && rooms.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No such room' })
  }

  const fromAt = Math.floor(window.fromAt.getTime() / 1000)
  const toAt = Math.floor(window.toAt.getTime() / 1000)
  const held = and(
    inArray(schema.roomBookings.status, [...HOLDS_A_SLOT]),
    sql`${schema.roomBookings.startsAt} < ${toAt}`,
    sql`${schema.roomBookings.endsAt} > ${fromAt}`,
    input.roomId ? eq(schema.roomBookings.roomId, input.roomId) : undefined,
  )

  // Counted before it is fetched, and refused rather than truncated: a sweep that quietly
  // returned half the bookings would show a taken slot as free (criterion 1).
  const [counted] = await db.select({ rows: sql<number>`count(*)` }).from(schema.roomBookings).where(held)
  const bound = await configValue(event, 'ROOM_AVAILABILITY_ROW_BOUND')
  if ((counted?.rows ?? 0) > bound) {
    throw createError({
      statusCode: 413,
      statusMessage: `That span covers more than ${bound} bookings. Ask for a shorter one.`,
    })
  }

  const rows = await db.select({
    roomId: schema.roomBookings.roomId,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    title: schema.roomBookings.title,
    userId: schema.roomBookings.userId,
    bookedBy: schema.users.name,
  })
    .from(schema.roomBookings)
    .leftJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(held)
    .orderBy(asc(schema.roomBookings.startsAt))

  // Detail for an officer, and for a person's own booking: a member may see what they booked.
  const canSeeDetail = permissions.has('rooms.read')

  // Never masked, unlike a booking. A closed room explains itself to everybody, which is the one
  // deliberate exception to C-103's masking (C-114 criterion 4).
  const shut = await blackoutsAcross(fromAt, toAt)

  return {
    from: input.from,
    to: input.to,
    rooms: rooms.map(room => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      sensitive: room.sensitive,
      isExternal: room.isExternal,
      hours: room.hours,
      taken: takenIn(rows, room.id, account.id, canSeeDetail),
      closed: shut
        .filter(blackout => coversRoom(blackout, room.id))
        .map(blackout => ({ startsAt: blackout.startsAt, endsAt: blackout.endsAt, reason: blackout.reason })),
    })),
  }
})

interface Row { roomId: string, startsAt: number, endsAt: number, status: string, title: string, userId: string, bookedBy: string | null }

function takenIn(rows: Row[], roomId: string, viewerId: string, canSeeDetail: boolean): (Conflict & { status: string, mine: boolean })[] {
  return rows
    .filter(row => row.roomId === roomId)
    .map((row) => {
      const mine = row.userId === viewerId
      const [masked] = maskConflicts([{ ...row, bookedBy: row.bookedBy ?? undefined }], canSeeDetail || mine)
      return { ...masked!, status: row.status, mine }
    })
}
