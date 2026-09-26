import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsSubquery } from './capacity'
import { showNightBounds } from '#shared/utils/show-night'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// The duty manager's tonight screen (E-112). Every query binds a fixed number of parameters per
// performance asked about, bounded by the programme rather than by any table's row count (0003).

export interface TonightHouse {
  sold: number
  admitted: number
  capacity: number | null
  remaining: number | null
}

// "Sold" rides `heldSeatsSubquery`, never a bare row count (D-105 criterion 2). `admitted` is
// `reservations.status = 'DOOR'`, which nothing writes until D-126 builds the door scan.
export function tonightHouseQuery(performanceId: string): SQL {
  return sql`
    SELECT
      ${heldSeatsSubquery(sql`${performanceId}`)} AS sold,
      (SELECT count(*) FROM reservations WHERE performance_id = ${performanceId} AND status = 'DOOR') AS admitted
  `
}

export async function tonightHouse(performanceId: string, capacity: number | null): Promise<TonightHouse> {
  const [row] = await db.all<{ sold: number, admitted: number }>(tonightHouseQuery(performanceId))
  const sold = row?.sold ?? 0
  const admitted = row?.admitted ?? 0
  return { sold, admitted, capacity, remaining: capacity === null ? null : Math.max(0, capacity - sold) }
}

export interface TonightTeamMember {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  filled: boolean
  claimed: boolean
  name: string | null
  phone: string | null
}

interface TeamRow {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  userId: string | null
  name: string | null
  phone: string | null
  visible: number | null
}

export function tonightTeamQuery(performanceId: string): SQL {
  return sql`
    SELECT s.id AS shiftId, s.role AS role, s.status AS status, s.user_id AS userId,
           u.name AS name, u.phone AS phone, scp.visible AS visible
    FROM shifts s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shift_contact_preferences scp ON scp.user_id = s.user_id
    WHERE s.performance_id = ${performanceId} AND s.status <> 'CANCELLED'
    ORDER BY s.role, s.slot
  `
}

// Filled means confirmed (E-112 criterion 2): a claim names its claimant as claimed, never as on
// shift, and never with a number to ring. The phone shows only where consent is set, read fresh.
export function readTeamRow(row: TeamRow): TonightTeamMember {
  const filled = row.status === 'CONFIRMED'
  const claimed = row.status === 'CLAIMED'
  return {
    shiftId: row.shiftId,
    role: row.role,
    status: row.status,
    filled,
    claimed,
    name: filled || claimed ? row.name : null,
    phone: filled && row.visible ? row.phone : null,
  }
}

export async function tonightTeam(performanceId: string): Promise<TonightTeamMember[]> {
  const rows = await db.all<TeamRow>(tonightTeamQuery(performanceId))
  return rows.map(readTeamRow)
}

// A claim of this role waiting for an officer on tonight's programme, so a refusal can name it; a
// bar claim may sit on a performance or on tonight's bar opening (E-104, 0077).
export function claimedShiftTonightQuery(userId: string, role: ShiftRole, from: number, to: number): SQL {
  const opening = role === 'BAR'
    ? sql` OR EXISTS (
        SELECT 1 FROM bar_opening_shifts os
        JOIN bar_openings o ON o.id = os.opening_id
        WHERE os.user_id = ${userId} AND os.status = 'CLAIMED'
          AND o.status <> 'CANCELLED' AND o.starts_at >= ${from} AND o.starts_at < ${to}
      )`
    : sql``
  return sql`
    SELECT (EXISTS (
      SELECT 1 FROM shifts s
      JOIN performances p ON p.id = s.performance_id
      WHERE s.user_id = ${userId} AND s.role = ${role} AND s.status = 'CLAIMED'
        AND p.status <> 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${to}
    )${opening}) AS claimed
  `
}

export async function claimedShiftTonight(userId: string, role: ShiftRole, night: string): Promise<boolean> {
  const { from, to } = showNightBounds(night)
  const [row] = await db.all<{ claimed: number }>(
    claimedShiftTonightQuery(userId, role, Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)),
  )
  return Boolean(row?.claimed)
}

export interface OnCall { name: string, phone: string }

// Who the emergency card says to ring after 999 (E-113): tonight's own confirmed duty managers,
// deduplicated so one person across both of a matinee day's houses is one number (E-112).
export function dutyManagersOnCall(team: readonly TonightTeamMember[]): OnCall[] {
  const seen = new Map<string, OnCall>()
  for (const member of team) {
    if (member.role !== 'DUTY_MANAGER' || !member.filled || !member.name || !member.phone) continue
    seen.set(`${member.name}\u0000${member.phone}`, { name: member.name, phone: member.phone })
  }
  return [...seen.values()]
}

export interface TonightPerformance {
  performanceId: string
  showId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  latecomerPolicy: string | null
  ageGuidance: string | null
  contentNotes: string | null
  capacityOverride: number | null
  venueCapacity: number | null
}

// Bound at the performance's own id, one row per call: `performanceIds` never grows with a
// table's size, only with how many performances one venue runs one night (E-127 criterion 1).
export function tonightPerformanceQuery(performanceId: string): SQL {
  return sql`
    SELECT p.id AS performanceId, sh.id AS showId, sh.title AS showTitle, v.name AS venueName,
           p.starts_at AS startsAt, p.doors_at AS doorsAt, p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount, p.interval_minutes AS intervalMinutes,
           sh.latecomer_policy AS latecomerPolicy, sh.age_guidance AS ageGuidance,
           sh.content_notes AS contentNotes,
           p.capacity_override AS capacityOverride, v.capacity AS venueCapacity
    FROM performances p
    JOIN shows sh ON sh.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.id = ${performanceId}
  `
}

export async function tonightPerformance(performanceId: string): Promise<TonightPerformance | undefined> {
  const [row] = await db.all<TonightPerformance>(tonightPerformanceQuery(performanceId))
  return row
}
