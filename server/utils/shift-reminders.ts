import { sql } from 'drizzle-orm'
import { formatLondon } from '#shared/utils/london'
import { calendarFor } from '#shared/utils/ics'
import { saysShiftRole } from '#shared/utils/rota'
import { offsetsFor, shiftWindow } from '#shared/utils/rota-times'
import { showNightBounds } from '#shared/utils/show-night'
import { tomorrowsShiftNight } from '#shared/utils/shift-reminders'
import type { ShiftRole } from '#shared/utils/rota'
import type { ShiftOffsets, ShiftWindow } from '#shared/utils/rota-times'
import type { H3Event } from 'h3'

// The database half of E-109's day-before reminder; `tomorrowsShiftNight` is the pure boundary
// logic, in `shared/utils/shift-reminders.ts` where the unit tests reach it.

export interface ShiftReminderRun { shifts: number, sent: number, skipped: number }

// The shift's own window where it is stamped, and the same arithmetic where it is not: a shift
// stamped before shifts had windows is filled by the backfill, not guessed at here (0078, E-131).
function windowFor(row: ShiftReminderRow, defaults: ShiftOffsets): ShiftWindow {
  if (row.shiftStartsAt !== null && row.shiftEndsAt !== null) {
    return { startsAt: row.shiftStartsAt, endsAt: row.shiftEndsAt }
  }
  return shiftWindow(row, offsetsFor(row, defaults))
}

interface ShiftReminderRow {
  shiftId: string
  userId: string
  role: ShiftRole
  venueName: string
  showTitle: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number | null
  intervalMinutes: number | null
  shiftStartsAt: number | null
  shiftEndsAt: number | null
  startsBeforeDoorsMinutes: number | null
  endsAfterEndMinutes: number | null
  confirmedAt: number | null
}

async function confirmedShiftsOn(night: string): Promise<ShiftReminderRow[]> {
  const { from, to } = showNightBounds(night)
  return await db.all<ShiftReminderRow>(sql`
    SELECT s.id AS shiftId, s.user_id AS userId, s.role AS role, s.confirmed_at AS confirmedAt,
           v.name AS venueName, sh.title AS showTitle,
           p.starts_at AS startsAt, p.doors_at AS doorsAt, p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount, p.interval_minutes AS intervalMinutes,
           s.starts_at AS shiftStartsAt, s.ends_at AS shiftEndsAt,
           t.starts_before_doors_minutes AS startsBeforeDoorsMinutes, t.ends_after_end_minutes AS endsAfterEndMinutes
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN venues v ON v.id = p.venue_id
    JOIN shows sh ON sh.id = p.show_id
    LEFT JOIN shift_templates t ON t.venue_id = p.venue_id AND t.role = s.role
    WHERE s.status = 'CONFIRMED' AND p.status <> 'CANCELLED'
      AND p.starts_at >= ${Math.floor(from.getTime() / 1000)} AND p.starts_at < ${Math.floor(to.getTime() / 1000)}
    ORDER BY p.starts_at, s.role, s.slot
  `)
}

// One message per shift, not per holder: a member working both a matinee and an evening
// tomorrow is told about each in its own mail, each with its own idempotency (criterion 3).
export async function remindShiftsTomorrow(event: H3Event | undefined, at = new Date()): Promise<ShiftReminderRun> {
  const rows = await confirmedShiftsOn(tomorrowsShiftNight(at))
  const base = useRuntimeConfig(event).public.baseURL
  const defaults = await shiftOffsetDefaults(event)

  let sent = 0
  let skipped = 0

  for (const row of rows) {
    const key = `shift.reminder:${row.shiftId}`
    const took = await claimNotification({ userId: row.userId, type: 'shift.reminder', key })
    if (!took) {
      skipped++
      continue
    }

    const worked = windowFor(row, defaults)

    await notify(event, {
      userId: row.userId,
      type: 'shift.reminder',
      claim: key,
      context: {
        name: '',
        show: row.showTitle,
        venue: row.venueName,
        role: saysShiftRole(row.role).toLowerCase(),
        when: formatLondon(new Date(worked.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      },
      attachments: [{
        filename: 'shift.ics',
        contentType: 'text/calendar; charset=utf-8',
        content: calendarFor([{
          id: row.shiftId,
          title: `${saysShiftRole(row.role)}, ${row.showTitle}`,
          room: row.venueName,
          startsAt: worked.startsAt,
          endsAt: worked.endsAt,
          status: 'CONFIRMED',
          updatedAt: row.confirmedAt ?? row.startsAt,
        }], { name: 'New Theatre shifts', host: new URL(base).hostname }),
      }],
    })
    sent++
  }

  return { shifts: rows.length, sent, skipped }
}
