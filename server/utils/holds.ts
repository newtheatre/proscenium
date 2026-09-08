import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditedWrite } from './audit'
import { configValue } from './configuration'
import { claimNotification, notify } from './notify'
import { auditEntry } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { holdReminderClaim } from '#shared/utils/reservations'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

// D-106 and D-107: releasing an unpaid hold and warning its holder beforehand. Both read
// `reservations.hold_expires_at`, the timestamp D-104's write path sets at reservation.

// Releasing a hold is a status change, so it takes 0049's shape: the predicate rides the write,
// and the caller decides a race from this statement's own `RETURNING`, never a stored actor id.
export function releaseHoldStatement(reservationId: string): SQL {
  return sql`
    UPDATE reservations SET status = 'EXPIRED', updated_at = unixepoch()
    WHERE id = ${reservationId} AND status = 'PENDING'
    RETURNING id
  `
}

export interface ExpiredHoldRow {
  id: string
}

// Oldest first, so a backlog drains in the order it built up rather than by whichever row the
// query happens to touch last (0006: bound by `cap`, never by how many rows actually match).
export function expiredHoldsQuery(at: number, cap: number): SQL {
  return sql`
    SELECT id FROM reservations
    WHERE status = 'PENDING' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ${at}
    ORDER BY hold_expires_at
    LIMIT ${cap}
  `
}

export interface ReminderCandidateRow {
  id: string
  reference: string
  userId: string
  holdExpiresAt: number
  startsAt: number
  showTitle: string
}

// Still PENDING, not yet expired, and past the reminder's own trigger point. A collected or
// cancelled reservation is never PENDING, so criterion 4 is the predicate, not a second check.
export function reminderCandidatesQuery(at: number, reminderMinutes: number, cap: number): SQL {
  return sql`
    SELECT r.id AS id, r.reference AS reference, r.user_id AS userId, r.hold_expires_at AS holdExpiresAt,
           p.starts_at AS startsAt, s.title AS showTitle
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE r.status = 'PENDING' AND r.user_id IS NOT NULL AND r.hold_expires_at IS NOT NULL
      AND r.hold_expires_at > ${at}
      AND (r.hold_expires_at - ${reminderMinutes * 60}) <= ${at}
    ORDER BY r.hold_expires_at
    LIMIT ${cap}
  `
}

export interface ReleaseRun {
  eligible: number
  released: number
}

// `auditedWrite` is 0049's shape: a hold already moved by something else writes no trail for
// a release that did not happen (D-106 criterion 5).
export async function releaseExpiredHolds(at: Date, cap: number): Promise<ReleaseRun> {
  const now = Math.floor(at.getTime() / 1000)
  const candidates = await db.all<ExpiredHoldRow>(expiredHoldsQuery(now, cap))

  let released = 0
  for (const candidate of candidates) {
    const entry = auditEntry({ actorId: null, action: 'reservation.expired', target: `reservation:${candidate.id}` })
    const applied = await auditedWrite(db.all<{ id: string }>(releaseHoldStatement(candidate.id)), entry)
    if (applied) released += 1
  }

  return { eligible: candidates.length, released }
}

export interface HoldReminderRun {
  eligible: number
  sent: number
}

export async function sendHoldReminders(event: H3Event | undefined, at: Date, cap: number): Promise<HoldReminderRun> {
  const reminderMinutes = await configValue(event, 'HOLD_REMINDER_MINUTES_BEFORE')
  const now = Math.floor(at.getTime() / 1000)
  const candidates = await db.all<ReminderCandidateRow>(reminderCandidatesQuery(now, reminderMinutes, cap))

  let sent = 0
  for (const candidate of candidates) {
    const claim = holdReminderClaim(candidate.id, candidate.holdExpiresAt)
    const took = await claimNotification({
      userId: candidate.userId,
      type: 'reservation.hold-expiring',
      key: claim,
      recordId: candidate.id,
    })
    if (!took) continue

    const outcome = await notify(event, {
      userId: candidate.userId,
      type: 'reservation.hold-expiring',
      claim,
      context: {
        name: '',
        reference: candidate.reference,
        show: candidate.showTitle,
        when: formatLondon(new Date(candidate.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        releasesAt: formatLondon(new Date(candidate.holdExpiresAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      },
    })
    if (outcome === 'SENT') sent += 1
  }

  return { eligible: candidates.length, sent }
}
