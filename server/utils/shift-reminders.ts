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

// How long a shift runs where the programme records nothing: the old margin, kept for the one
// case the window arithmetic cannot answer.
const DEFAULT_SHIFT_MINUTES = 180

// The shift's own window where it is stamped, and the same arithmetic where it is not: a shift
// stamped before shifts had windows is filled by the backfill, not guessed at here (0078, E-131).
function windowFor(row: ShiftReminderRow, defaults: ShiftOffsets): ShiftWindow {
  if (row.shiftStartsAt !== null && row.shiftEndsAt !== null) {
    return { startsAt: row.shiftStartsAt, endsAt: row.shiftEndsAt }
  }
  // A calendar block has to end somewhere, so a performance with no recorded running time takes
  // this rather than a block that frees itself at curtain up.
  const durationMinutes = row.durationMinutes ?? DEFAULT_SHIFT_MINUTES
  return shiftWindow({ ...row, durationMinutes }, offsetsFor(row, defaults))
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
  return await db.all<ShiftReminderRow>(confirmedShiftsQuery(from, to))
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
