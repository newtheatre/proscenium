import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import { isCurrent } from '#shared/utils/membership'
import { z } from 'zod'
import type { H3Event } from 'h3'

const query = z.object({
  room: z.string().max(64).optional(),
  // Answered requests stay readable, so a decision can be looked up rather than remembered.
  when: z.enum(['waiting', 'decided']).default('waiting'),
})

// Requests waiting on a decision, with what each one breaks.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, query)

  const rows = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    userId: schema.roomBookings.userId,
    requester: schema.users.name,
    title: schema.roomBookings.title,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    tier: schema.roomBookings.tier,
    status: schema.roomBookings.status,
    reason: schema.roomBookings.reason,
    rejectionReason: schema.roomBookings.rejectionReason,
    createdAt: schema.roomBookings.createdAt,
    escalatedAt: schema.roomBookings.escalatedAt,
    decidedAt: schema.roomBookings.decidedAt,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(and(
      input.when === 'waiting'
        ? eq(schema.roomBookings.status, 'PENDING_APPROVAL')
        : sql`${schema.roomBookings.decidedAt} IS NOT NULL`,
      input.room ? eq(schema.roomBookings.roomId, input.room) : undefined,
    ))
    .orderBy(input.when === 'waiting' ? asc(schema.roomBookings.createdAt) : desc(schema.roomBookings.decidedAt))
    .limit(200)

  // Judged now rather than recalled: a request written on Monday may have run out of notice by
  // Thursday, and the officer deciding needs what is true today (C-106).
  const rooms = await listRooms(true)
  const estate = await estatePolicy(event)
  const now = new Date()
  const held = await heldByRequesters()
  const current = await membersAmongRequesters(event, now)
  const stopped = await requestersUnderPreApproval(event, rows, now)

  const items = rows.map((row) => {
    const room = rooms.find(one => one.id === row.roomId)
    const verdict = room && judge(
      { startsAt: new Date(row.startsAt * 1000), endsAt: new Date(row.endsAt * 1000) },
      resolvePolicy(room, estate),
      room,
      {
        now,
        // The requester's standing, never the reader's: this is what they were judged against.
        isAdmin: false,
        hasMembership: current.has(row.userId),
        activeBookings: held.get(row.userId) ?? 0,
        underPreApproval: stopped.has(row.userId),
      },
    )

    return {
      ...row,
      failures: verdict ? verdict.failures : [],
      sensitive: room?.sensitive ?? false,
      isExternal: room?.isExternal ?? false,
    }
  })

  return { when: input.when, items, total: items.length }
})

// Which requesters are on the no-show ladder. Counted per person rather than in one statement,
// because the count is a window function over the latest entry per booking (C-116).
async function requestersUnderPreApproval(event: H3Event, rows: { userId: string }[], now: Date): Promise<Set<string>> {
  const stopped = new Set<string>()
  for (const userId of new Set(rows.map(row => row.userId))) {
    if (await underPreApproval(event, userId, now)) stopped.add(userId)
  }
  return stopped
}

// The requesters, scoped by subquery rather than by an id list built from the rows above, so no
// statement's parameter count grows with the queue (0003, 0006).
const REQUESTERS = sql`SELECT user_id FROM room_bookings WHERE status = 'PENDING_APPROVAL'`

async function heldByRequesters(): Promise<Map<string, number>> {
  const now = Math.floor(Date.now() / 1000)
  const rows = await db.select({
    userId: schema.roomBookings.userId,
    held: sql<number>`count(*)`,
  })
    .from(schema.roomBookings)
    .where(and(
      inArray(schema.roomBookings.status, [...HOLDS_A_SLOT]),
      sql`${schema.roomBookings.endsAt} > ${now}`,
      sql`${schema.roomBookings.userId} IN (${REQUESTERS})`,
    ))
    .groupBy(schema.roomBookings.userId)

  return new Map(rows.map(row => [row.userId, row.held]))
}

// The longest-running term each requester holds, which is the one that counts (0031).
async function membersAmongRequesters(event: H3Event, now: Date): Promise<Set<string>> {
  const rows = await db.select({
    userId: schema.memberships.userId,
    startsOn: sql<string>`min(${schema.memberships.startsOn})`,
    expiresOn: sql<string>`max(${schema.memberships.expiresOn})`,
  })
    .from(schema.memberships)
    .where(sql`${schema.memberships.userId} IN (${REQUESTERS})`)
    .groupBy(schema.memberships.userId)

  const grace = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')
  const today = londonDay(now)
  return new Set(rows.filter(row => isCurrent(row, today, grace)).map(row => row.userId))
}
