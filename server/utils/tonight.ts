import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsSubquery } from './capacity'
import { firstNameOf } from '#shared/utils/night-hub'
import { SHIFT_ROLES } from '#shared/utils/rota'
import { showNightBounds } from '#shared/utils/show-night'
import type { ConfirmedShiftScope } from './rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { FirstAider } from '#shared/utils/venue-emergency'
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

// A claim of this role waiting for an officer, inside the request's own scope on tonight's
// programme; a bar claim may sit on a performance or on tonight's bar opening (E-104, 0077).
export function claimedShiftTonightQuery(userId: string, role: ShiftRole, from: number, to: number, scope: ConfirmedShiftScope): SQL {
  const atVenue = scope.venueId ? sql` AND p.venue_id = ${scope.venueId}` : sql``
  const atPerformance = scope.performanceId ? sql` AND p.id = ${scope.performanceId}` : sql``
  // Narrowed as the guard's own opening lookup is: by venue alone, since an opening names no performance.
  const openingAtVenue = scope.venueId ? sql` AND o.venue_id = ${scope.venueId}` : sql``
  const opening = role === 'BAR'
    ? sql` OR EXISTS (
        SELECT 1 FROM bar_opening_shifts os
        JOIN bar_openings o ON o.id = os.opening_id
        WHERE os.user_id = ${userId} AND os.status = 'CLAIMED'
          AND o.status <> 'CANCELLED' AND o.starts_at >= ${from} AND o.starts_at < ${to}${openingAtVenue}
      )`
    : sql``
  return sql`
    SELECT (EXISTS (
      SELECT 1 FROM shifts s
      JOIN performances p ON p.id = s.performance_id
      WHERE s.user_id = ${userId} AND s.role = ${role} AND s.status = 'CLAIMED'
        AND p.status <> 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${to}${atVenue}${atPerformance}
    )${opening}) AS claimed
  `
}

export async function claimedShiftTonight(userId: string, role: ShiftRole, night: string, scope: ConfirmedShiftScope): Promise<boolean> {
  const { from, to } = showNightBounds(night)
  const [row] = await db.all<{ claimed: number }>(
    claimedShiftTonightQuery(userId, role, Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), scope),
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

export interface VenueTonight { venueId: string, venueName: string }

// Every venue running tonight, read by anyone signed in (E-113 criterion 2 as amended, 0077). An
// external venue counts once we staff it or have filed its card: until then its own rules apply.
export function venuesTonightQuery(from: number, to: number): SQL {
  const opening = sql`EXISTS (
    SELECT 1 FROM bar_openings o
    WHERE o.venue_id = v.id AND o.status <> 'CANCELLED' AND o.starts_at >= ${from} AND o.starts_at < ${to}
  )`
  const performance = (staffed: SQL) => sql`EXISTS (
    SELECT 1 FROM performances p
    WHERE p.venue_id = v.id AND p.status <> 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${to}${staffed}
  )`
  const ours = sql`(v.is_external = 0 OR EXISTS (SELECT 1 FROM venue_emergency_info e WHERE e.venue_id = v.id)
    OR ${performance(sql` AND EXISTS (SELECT 1 FROM shifts s WHERE s.performance_id = p.id AND s.status <> 'CANCELLED')`)})`
  return sql`
    SELECT v.id AS venueId, v.name AS venueName
    FROM venues v
    WHERE ${opening} OR (${performance(sql``)} AND ${ours})
    ORDER BY v.name COLLATE NOCASE
  `
}

export async function venuesTonight(from: number, to: number): Promise<VenueTonight[]> {
  return db.all<VenueTonight>(venuesTonightQuery(from, to))
}

// Tonight's confirmed team at a venue holding a current record of the first-aid module, expiring
// counted as held as every gate reads it (G-101 criterion 3); one row a person, every job listed.
export function firstAidersTonightQuery(venueId: string, from: number, to: number, moduleId: string, today: string): SQL {
  return sql`
    SELECT u.name AS name, group_concat(DISTINCT team.role) AS roles
    FROM (
      SELECT s.user_id AS userId, s.role AS role
      FROM shifts s
      JOIN performances p ON p.id = s.performance_id
      WHERE p.venue_id = ${venueId} AND p.status <> 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${to}
        AND s.status = 'CONFIRMED'
      UNION ALL
      SELECT os.user_id AS userId, 'BAR' AS role
      FROM bar_opening_shifts os
      JOIN bar_openings o ON o.id = os.opening_id
      WHERE o.venue_id = ${venueId} AND o.status <> 'CANCELLED' AND o.starts_at >= ${from} AND o.starts_at < ${to}
        AND os.status = 'CONFIRMED'
    ) team
    JOIN users u ON u.id = team.userId
    WHERE u.disabled = 0 AND u.anonymised_at IS NULL
      AND EXISTS (
        SELECT 1 FROM training_records r
        WHERE r.user_id = team.userId AND r.module_id = ${moduleId} AND r.revoked_at IS NULL
          AND (r.expires_on IS NULL OR r.expires_on > ${today})
      )
    GROUP BY team.userId
    ORDER BY u.name COLLATE NOCASE
  `
}

// `group_concat` keeps no order, so the roles are put back in the rota's own.
export function readFirstAiders(rows: readonly { name: string, roles: string }[]): FirstAider[] {
  return rows.flatMap((row) => {
    const firstName = firstNameOf(row.name)
    const held = row.roles.split(',')
    return firstName ? [{ firstName, roles: SHIFT_ROLES.filter(role => held.includes(role)) }] : []
  })
}

export async function firstAidersTonight(venueId: string, from: number, to: number, moduleId: string, today: string): Promise<FirstAider[]> {
  return readFirstAiders(await db.all<{ name: string, roles: string }>(firstAidersTonightQuery(venueId, from, to, moduleId, today)))
}

// The answer a duty manager gives at the claim, batched after the claim and written only if that
// claim took the shift, so a lost race changes nobody's consent (A-114, 0003).
export function shareNumberStatement(shiftId: string, userId: string, visible: boolean): SQL {
  return sql`
    INSERT INTO shift_contact_preferences (user_id, visible, updated_at)
    SELECT ${userId}, ${visible ? 1 : 0}, unixepoch()
    WHERE EXISTS (
      SELECT 1 FROM shifts WHERE id = ${shiftId} AND user_id = ${userId} AND status IN ('CLAIMED', 'CONFIRMED')
    )
    ON CONFLICT (user_id) DO UPDATE SET visible = excluded.visible, updated_at = excluded.updated_at
  `
}

export interface DutyManagerToTell { firstName: string, phone: string | null }

// Who a volunteer tells when they cannot make tonight, in place of a release the server refuses:
// the confirmed duty manager, by first name, with the number only where it was shared (A-114).
export function dutyManagerToTell(team: readonly TonightTeamMember[]): DutyManagerToTell | null {
  const found = team.find(member => member.role === 'DUTY_MANAGER' && member.filled && firstNameOf(member.name))
  return found ? { firstName: firstNameOf(found.name) ?? '', phone: found.phone } : null
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
