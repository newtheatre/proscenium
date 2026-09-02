import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { judge, resolvePolicy } from '#shared/utils/booking-policy'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import { isCurrent } from '#shared/utils/membership'
import { LIST_CAP } from '#server/utils/external-requests'
import { addWorkingDays, coversThrough, londonDate } from '#shared/utils/working-days'
import type { QueueItem } from '#shared/utils/queue'
import type { H3Event } from 'h3'

// The date the form has to go in by, counted back from the booking in working days, so the
// deadline belongs to the person who can meet it (C-121 criterion 2). Null when unknowable.
export async function formDeadline(event: H3Event | undefined, startsAt: number): Promise<string | null> {
  const holidays = await configValue(event, 'BANK_HOLIDAYS')
  const at = new Date(startsAt * 1000)
  if (!coversThrough(holidays, at)) return null

  const notice = await configValue(event, 'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS')
  return londonDate(addWorkingDays(at, -notice, holidays))
}

// Requests for our own rooms, judged as they are read: one written on Monday may have run out of
// notice by Thursday, and the officer deciding needs what is true today (C-109 criterion 1).
export async function pendingRoomRequests(
  event: H3Event,
  when: 'open' | 'all',
  room?: string,
): Promise<QueueItem[]> {
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
    purpose: schema.roomBookings.purpose,
    status: schema.roomBookings.status,
    reason: schema.roomBookings.reason,
    rejectionReason: schema.roomBookings.rejectionReason,
    createdAt: schema.roomBookings.createdAt,
    escalatedAt: schema.roomBookings.escalatedAt,
    decidedAt: schema.roomBookings.decidedAt,
    convertedToRequestId: schema.roomBookings.convertedToRequestId,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(and(
      when === 'open'
        ? eq(schema.roomBookings.status, 'PENDING_APPROVAL')
        : sql`(${schema.roomBookings.status} = 'PENDING_APPROVAL' OR ${schema.roomBookings.decidedAt} IS NOT NULL)`,
      room ? eq(schema.roomBookings.roomId, room) : undefined,
    ))
    .orderBy(asc(schema.roomBookings.startsAt))
    .limit(LIST_CAP + 1)

  const rooms = await listRooms(true)
  const estate = await estatePolicy(event)
  const now = new Date()
  const held = await heldByRequesters()
  const current = await membersAmongRequesters(event, now)
  const stopped = await requestersUnderPreApproval(event, rows, now)

  return rows.map((row) => {
    const found = rooms.find(one => one.id === row.roomId)
    const verdict = found && judge(
      { startsAt: new Date(row.startsAt * 1000), endsAt: new Date(row.endsAt * 1000) },
      resolvePolicy(found, estate),
      found,
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
      kind: 'room' as const,
      where: row.room,
      failures: verdict ? verdict.failures : [],
      sensitive: found?.sensitive ?? false,
    }
  })
}

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
