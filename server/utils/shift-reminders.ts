import { sql } from 'drizzle-orm'
import { formatLondon } from '#shared/utils/london'
import { calendarFor } from '#shared/utils/ics'
import { saysShiftRole } from '#shared/utils/rota'
import { showNightBounds } from '#shared/utils/show-night'
import { tomorrowsShiftNight } from '#shared/utils/shift-reminders'
import type { ShiftRole } from '#shared/utils/rota'
import type { H3Event } from 'h3'

// The database half of E-109's day-before reminder; `tomorrowsShiftNight` is the pure boundary
// logic, in `shared/utils/shift-reminders.ts` where the unit tests reach it.

export interface ShiftReminderRun { shifts: number, sent: number, skipped: number }

// No column holds a call time distinct from the curtain, so the door time stands in where a
// venue has set one; a night with none falls back to curtain itself.
function callTimeOf(row: { startsAt: number, doorsAt: number | null }): number {
  return row.doorsAt ?? row.startsAt
}

// Nothing records how long a shift itself runs, so the calendar block is the show plus this
// margin either side of it when no performance duration is known.
const DEFAULT_SHIFT_MINUTES = 180

interface ShiftReminderRow {
  shiftId: string
  userId: string
  role: ShiftRole
  venueName: string
  showTitle: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  confirmedAt: number | null
}

async function confirmedShiftsOn(night: string): Promise<ShiftReminderRow[]> {
  const { from, to } = showNightBounds(night)
  return await db.all<ShiftReminderRow>(sql`
    SELECT s.id AS shiftId, s.user_id AS userId, s.role AS role, s.confirmed_at AS confirmedAt,
           v.name AS venueName, sh.title AS showTitle,
           p.starts_at AS startsAt, p.doors_at AS doorsAt, p.duration_minutes AS durationMinutes
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN venues v ON v.id = p.venue_id
    JOIN shows sh ON sh.id = p.show_id
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

  let sent = 0
  let skipped = 0

  for (const row of rows) {
    const key = `shift.reminder:${row.shiftId}`
    const took = await claimNotification({ userId: row.userId, type: 'shift.reminder', key })
    if (!took) {
      skipped++
      continue
    }

    const callTime = callTimeOf(row)
    const endsAt = row.startsAt + (row.durationMinutes ?? DEFAULT_SHIFT_MINUTES) * 60

    await notify(event, {
      userId: row.userId,
      type: 'shift.reminder',
      claim: key,
      context: {
        name: '',
        show: row.showTitle,
        venue: row.venueName,
        role: saysShiftRole(row.role).toLowerCase(),
        when: formatLondon(new Date(callTime * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      },
      attachments: [{
        filename: 'shift.ics',
        contentType: 'text/calendar; charset=utf-8',
        content: calendarFor([{
          id: row.shiftId,
          title: `${saysShiftRole(row.role)}, ${row.showTitle}`,
          room: row.venueName,
          startsAt: callTime,
          endsAt,
          status: 'CONFIRMED',
          updatedAt: row.confirmedAt ?? row.startsAt,
        }], { name: 'New Theatre shifts', host: new URL(base).hostname }),
      }],
    })
    sent++
  }

  return { shifts: rows.length, sent, skipped }
}
