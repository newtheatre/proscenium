/**
 * When online booking closes for a performance.
 *
 * `performances.bookingClosesHoursBefore` came across from the legacy system's
 * `hours_til_close` and is set on 1,254 imported performances — 789 at two
 * hours, 440 at one, 25 at zero — but nothing read it, so the only guard on the
 * public booking path was "has it started yet". A customer could book online at
 * curtain-up on a performance front-of-house had closed two hours earlier.
 *
 * Null means no cutoff beyond the performance itself, which is also what zero
 * means. Both leave booking open until `startsAt`.
 */

export interface BookingWindowPerformance {
  startsAt: Date
  bookingClosesHoursBefore: number | null
}

const MS_PER_HOUR = 60 * 60 * 1000

export function bookingClosesAt(performance: BookingWindowPerformance): Date {
  const hours = performance.bookingClosesHoursBefore ?? 0
  return new Date(performance.startsAt.getTime() - hours * MS_PER_HOUR)
}

export function isBookingOpen(performance: BookingWindowPerformance, now = new Date()): boolean {
  return now < bookingClosesAt(performance)
}

/**
 * Guard the customer-facing write paths. Staff endpoints deliberately do not
 * call this: the box office takes walk-ups after online booking has closed, and
 * that is the whole point of closing it early.
 */
export function assertBookingOpen(performance: BookingWindowPerformance, now = new Date()): void {
  if (isBookingOpen(performance, now)) return

  const closesAt = bookingClosesAt(performance)
  const started = now >= performance.startsAt

  throw createError({
    statusCode: 400,
    statusMessage: started
      ? 'This performance has already started'
      // Europe/London, not the Worker's UTC: quoting a cutoff an hour before
      // the one the show page advertised sends the customer to the box office
      // convinced the site is wrong.
      : `Online booking for this performance closed at ${closesAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}. Tickets may still be available on the door.`,
  })
}
