import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { shiftOffsetDefaults } from './rota'
import { HOLDS_A_SLOT, overlaps } from '#shared/utils/bookings'
import { performanceClosure } from '#shared/utils/performance-closures'
import type { ListedPerformanceClosure, Overlapping, PerformanceClosure, PerformanceOnStage } from '#shared/utils/performance-closures'
import type { ShiftOffsets } from '#shared/utils/rota-times'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// The rooms a performance closes, read when a booking or the calendar is (0043, issue 1347).
// Named imports rather than Nitro's, because `tests/` typechecks this file under Bun.

export interface PerformanceOnRoom extends PerformanceOnStage {
  roomName: string
  venueName: string
  listedTitle: string
}

// Filtered on the window itself, `shiftWindow()`'s arithmetic in SQL as rota.ts stamps it, so no
// doors time or offset puts a closure outside the read; binds the same values however full (0006).
export function performancesOnRoomsQuery(from: number, to: number, offsets: ShiftOffsets, roomId?: string): SQL {
  const room = roomId === undefined ? sql`v.room_id IS NOT NULL` : sql`v.room_id = ${roomId}`
  return sql`
    SELECT p.id AS performanceId, v.room_id AS roomId, r.name AS roomName, v.name AS venueName,
           CASE WHEN s.status = 'PUBLISHED' THEN s.title END AS showTitle, s.title AS listedTitle,
           p.starts_at AS startsAt, p.doors_at AS doorsAt, p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount, p.interval_minutes AS intervalMinutes
    FROM performances p
    JOIN venues v ON v.id = p.venue_id
    JOIN rooms r ON r.id = v.room_id
    JOIN shows s ON s.id = p.show_id
    WHERE ${room} AND p.status <> 'CANCELLED'
      AND coalesce(p.doors_at, p.starts_at) - ${offsets.startBeforeDoorsMinutes} * 60 < ${to}
      AND p.starts_at + (coalesce(p.duration_minutes, 0) + p.interval_count * coalesce(p.interval_minutes, 0)) * 60
        + ${offsets.endAfterEndMinutes} * 60 >= ${from}
    ORDER BY p.starts_at
  `
}

// The room open over a span: no officer's closure of it or of every room, and no performance at
// the venue it belongs to over its window. Half-open, as the clash rule is (C-114, issue 1347).
export function roomOpenTerms(roomId: string, startsAt: number, endsAt: number, offsets: ShiftOffsets): SQL {
  return sql`NOT EXISTS (
      SELECT 1 FROM room_blackouts b
      WHERE (b.room_id = ${roomId} OR b.room_id IS NULL) AND b.starts_at < ${endsAt} AND b.ends_at > ${startsAt}
    )
    AND NOT EXISTS (
      SELECT 1 FROM performances p
      JOIN venues v ON v.id = p.venue_id
      WHERE v.room_id = ${roomId} AND p.status <> 'CANCELLED'
        AND coalesce(p.doors_at, p.starts_at) - ${offsets.startBeforeDoorsMinutes} * 60 < ${endsAt}
        AND p.starts_at + (coalesce(p.duration_minutes, 0) + p.interval_count * coalesce(p.interval_minutes, 0)) * 60
          + ${offsets.endAfterEndMinutes} * 60 > ${startsAt}
    )`
}

async function onRooms(event: H3Event | undefined, from: number, to: number, roomId?: string): Promise<{ rows: PerformanceOnRoom[], offsets: ShiftOffsets }> {
  const offsets = await shiftOffsetDefaults(event)
  return { rows: await db.all<PerformanceOnRoom>(performancesOnRoomsQuery(from, to, offsets, roomId)), offsets }
}

// The same edges an officer's closure is read with, so the two kinds refuse alike. Never the
// listed title: a refusal hands its closure to whoever was refused.
export async function performanceClosuresAcross(event: H3Event | undefined, from: number, to: number, roomId?: string): Promise<(PerformanceClosure & { room: string, venue: string })[]> {
  const { rows, offsets } = await onRooms(event, from, to, roomId)
  return rows.map(row => ({ ...performanceClosure(row, offsets), room: row.roomName, venue: row.venueName }))
}

// For the Theatre Manager to settle by hand: a booking made before its room was attached, or
// before the performance was scheduled, is left standing rather than cancelled (issue 1347).
export async function performanceClosuresListed(event: H3Event | undefined, from: number, to: number): Promise<ListedPerformanceClosure[]> {
  const { rows, offsets } = await onRooms(event, from, to)
  if (rows.length === 0) return []

  const closures = rows.map(row => ({
    ...performanceClosure(row, offsets),
    room: row.roomName,
    venue: row.venueName,
    show: row.listedTitle,
    published: row.showTitle !== null,
  }))
  const earliest = Math.min(...closures.map(closure => closure.startsAt))
  const latest = Math.max(...closures.map(closure => closure.endsAt))

  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  const bookings = await db.all<Overlapping & { roomId: string }>(sql`
    SELECT b.id AS id, b.room_id AS roomId, b.title AS title, b.status AS status,
           b.starts_at AS startsAt, b.ends_at AS endsAt, u.name AS bookedBy
    FROM room_bookings b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.status IN (${sql.join(held, sql`, `)})
      AND b.room_id IN (SELECT room_id FROM venues WHERE room_id IS NOT NULL)
      AND b.starts_at < ${latest} AND b.ends_at > ${earliest}
    ORDER BY b.starts_at
  `)

  return closures.map(closure => ({
    ...closure,
    overlapping: bookings
      .filter(booking => booking.roomId === closure.roomId && overlaps(booking, closure))
      .map(({ roomId: _room, ...booking }) => booking),
  }))
}
