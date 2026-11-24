// Every 15 minutes: one reminder to each booker whose booking starts within spaces.reminders.before
// (SP-22). `reminded_at` is set in the same unit, so a second run sends nothing. Zero sends none.
import { sql } from 'drizzle-orm'
import { all, createUnit, defineTask, isRefusal, log, nowMs, useSetting } from '#kit'
import { notify } from '#modules/core'
import { history } from '../bookings'
import { bookingWords } from '../words'

const SECOND = 1000 // not-policy: settings are whole seconds
const PER_RUN = 100 // not-policy: a run's share of reminders

export default defineTask(async () => {
  const before = (await useSetting('spaces.reminders.before') as number) * SECOND
  if (!before) return
  const at = nowMs()
  const due = await all<{ id: string, booked_for: string }>(
    'SELECT id, booked_for FROM spaces_bookings WHERE state = \'confirmed\' AND reminded_at IS NULL AND starts_at > ? AND starts_at <= ? ORDER BY starts_at LIMIT ?', at, at + before, PER_RUN)
  for (const booking of due) {
    try {
      const unit = createUnit()
      unit.add(sql`UPDATE spaces_bookings SET reminded_at = ${at} WHERE id = ${booking.id} AND state = 'confirmed' AND reminded_at IS NULL`)
        .expect(1, { code: 'spaces.reminder.sent', reason: 'Already reminded.' })
      history(unit.view(), booking.id, 'reminder-sent', null, at)
      await notify(unit.view(), 'spaces.booking-reminder', { to: booking.booked_for, variables: await bookingWords(booking.id), dedupeKey: `reminder:${booking.id}`, subject: ['spaces.booking', booking.id] })
      await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('spaces.reminder-failed', { bookingId: booking.id, error: String((error as Error)?.message ?? error) })
    }
  }
})
