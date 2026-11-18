// A booking as its link shows it (GET /api/box-office/orders/link), for the pages that show one:
// Your booking, the confirmation screen and the screen after booking.

/** `unnamed` where there is one kind of ticket to book, so its name is left out as Choose tickets leaves it out. */
export interface BookingLine { id: string, performanceId: string, ticketType: string, band: string | null, amountMinor: number, unnamed?: true }
export interface BookingTicket { lineId: string, number: string, doorCode: string | null, admitted: boolean }
export interface BookingShow { title: string, productionSlug: string, startsAt: number, endsAt: number, venue: string, venueSlug: string | null, address: string | null, cancelled: boolean }
export interface BookingView {
  accountUnclaimed?: boolean
  orderId: string
  reference: string
  state: string
  currency: string
  totalMinor: number
  amountDueMinor: number
  releaseAt: number | null
  lines: BookingLine[]
  buyerCancel: { feeMinor: number, until: number } | null
  tickets?: BookingTicket[]
  show?: BookingShow | null
}

/** What the server answers when a booking is made, free or reserved, as the screen after it shows it. */
export interface BookingDoneOutcome {
  state: 'confirmed' | 'reserved'
  reference: string
  /** Opens the booking (the link in the email). */
  token?: string
  deskCode?: string
  amountDueMinor?: number
  currency?: string
  accountLinkSent?: boolean
}

/** A line's name: its part of the house, such as a wheelchair space, where the production has more than one. */
export const bookingLineName = (l: Pick<BookingLine, 'band' | 'ticketType' | 'unnamed'>) => (l.unnamed ? '' : l.band ? `${l.band}, ${l.ticketType}` : l.ticketType)

/** "2 × Full price", or "2 tickets" where the kind goes unnamed (an empty label). */
export const ticketsLine = (t: ReturnType<typeof useT>['t'], count: number, label: string) => (label ? t('box-office.basket.line', { count, label }) : t('box-office.basket.tickets', { count }))

/** The lines grouped by what they are, with how many and what they cost together. */
export function groupedBookingLines(lines: readonly BookingLine[]): { label: string, count: number, amountMinor: number }[] {
  const grouped = new Map<string, { label: string, count: number, amountMinor: number }>()
  for (const l of lines) {
    const label = bookingLineName(l)
    const row = grouped.get(label) ?? { label, count: 0, amountMinor: 0 }
    row.count++
    row.amountMinor += l.amountMinor
    grouped.set(label, row)
  }
  return [...grouped.values()]
}

const icsStamp = (at: number) => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** An iCalendar file with the performance in it, for "Add to calendar". */
export function bookingCalendar(show: BookingShow, reference: string, url: string, description: string): string {
  const where = [show.venue, show.address].filter(Boolean).join(', ')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Proscenium//Box office//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reference}@proscenium`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(show.startsAt)}`,
    `DTEND:${icsStamp(show.endsAt > show.startsAt ? show.endsAt : show.startsAt + 2 * 3_600_000)}`, // not-policy: two hours where no end is known
    `SUMMARY:${icsText(show.title)}`,
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
