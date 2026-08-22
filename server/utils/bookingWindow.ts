/**
 * When online booking closes. Null and zero both mean no cutoff beyond
 * `startsAt`.
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
 * Customer-facing write paths only. Staff endpoints deliberately skip this:
 * the box office takes walk-ups after online booking closes.
 */
export function assertBookingOpen(performance: BookingWindowPerformance, now = new Date()): void {
  if (isBookingOpen(performance, now)) return

  const closesAt = bookingClosesAt(performance)
  const started = now >= performance.startsAt

  throw createError({
    statusCode: 400,
    statusMessage: started
      ? 'This performance has already started'
      // Europe/London, not the Worker's UTC: quoting a cutoff an hour out sends
      // the customer to the box office convinced the site is wrong.
      : `Online booking for this performance closed at ${closesAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}. Tickets may still be available on the door.`,
  })
}
