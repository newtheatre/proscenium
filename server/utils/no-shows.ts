import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { standingFor, windowStart } from '#shared/utils/no-shows'
import type { Ladder, Standing } from '#shared/utils/no-shows'
import type { H3Event } from 'h3'

// Counting no-shows and reading a member's standing (C-116). The table is append-only, so a count
// is the latest entry per booking rather than a row count (0010, criterion 2).

export async function ladderFor(event: H3Event | undefined): Promise<Ladder> {
  return {
    recordAt: await configValue(event, 'ROOM_NO_SHOW_RECORD_AT'),
    preApprovalAt: await configValue(event, 'ROOM_NO_SHOW_PREAPPROVAL_AT'),
  }
}

// One booking is one no-show whatever was written about it: the latest entry decides. Ties break
// on rowid, because two entries can share a second and this table never deletes (0010).
export async function noShowCount(userId: string, now: Date, windowDays: number): Promise<number> {
  const since = windowStart(now, windowDays)

  const [row] = await db.all<{ counted: number }>(sql`
    SELECT count(*) AS counted FROM (
      SELECT booking_id, kind, recorded_at,
             row_number() OVER (PARTITION BY booking_id ORDER BY recorded_at DESC, rowid DESC) AS latest
      FROM room_no_shows
      WHERE user_id = ${userId} AND recorded_at >= ${since}
    )
    WHERE latest = 1 AND kind = 'RECORDED'
  `)

  return row?.counted ?? 0
}

export interface MemberStanding {
  count: number
  standing: Standing
  ladder: Ladder
  windowDays: number
}

export async function standingOf(event: H3Event | undefined, userId: string, now = new Date()): Promise<MemberStanding> {
  const windowDays = await configValue(event, 'ROOM_NO_SHOW_WINDOW_DAYS')
  const ladder = await ladderFor(event)
  const count = await noShowCount(userId, now, windowDays)
  return { count, standing: standingFor(count, ladder), ladder, windowDays }
}

export async function underPreApproval(event: H3Event | undefined, userId: string, now = new Date()): Promise<boolean> {
  return (await standingOf(event, userId, now)).standing === 'PRE_APPROVAL'
}

export interface NoShowRow {
  id: string
  bookingId: string
  userId: string
  kind: string
  reason: string | null
  recordedAt: number
  by: string | null
  room: string
  title: string
  startsAt: number
}

// A member's own record, latest first, including withdrawals: the ladder is not a surprise
// (criterion 5).
export async function noShowsFor(userId: string, since: number): Promise<NoShowRow[]> {
  return db.select({
    id: schema.roomNoShows.id,
    bookingId: schema.roomNoShows.bookingId,
    userId: schema.roomNoShows.userId,
    kind: schema.roomNoShows.kind,
    reason: schema.roomNoShows.reason,
    recordedAt: schema.roomNoShows.recordedAt,
    by: schema.users.name,
    room: schema.rooms.name,
    title: schema.roomBookings.title,
    startsAt: schema.roomBookings.startsAt,
  })
    .from(schema.roomNoShows)
    .innerJoin(schema.roomBookings, eq(schema.roomBookings.id, schema.roomNoShows.bookingId))
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .leftJoin(schema.users, eq(schema.users.id, schema.roomNoShows.recordedBy))
    .where(and(eq(schema.roomNoShows.userId, userId), gte(schema.roomNoShows.recordedAt, since)))
    .orderBy(desc(schema.roomNoShows.recordedAt))
    .limit(200)
}

// The entry a correction supersedes, ordered exactly as the count is: what a withdrawal replaces
// and what the ladder counts must never disagree.
export async function latestFor(bookingId: string): Promise<{ id: string, kind: string, userId: string } | undefined> {
  const [row] = await db.all<{ id: string, kind: string, userId: string }>(sql`
    SELECT id, kind, user_id AS userId FROM room_no_shows
    WHERE booking_id = ${bookingId}
    ORDER BY recorded_at DESC, rowid DESC
    LIMIT 1
  `)

  return row
}
