import { formatLondon } from '#shared/utils/london'
import { ownBookingsFrom, qrStatusDisplay, saysTotalDue } from '#shared/utils/reservations'
import type { OwnBookingListing } from '#shared/utils/reservations'

// A page of the soonest, not a history: bound in SQL, not by how many a person holds (0006).
const LISTED = 20

// A signed-in person's own bookings still to come (issue 1332), each opening its booking page
// through the link route, which exchanges the token for the cookie as an emailed link does (D-108).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const rows = await ownBookings(account.id, ownBookingsFrom(new Date()), LISTED)

  const bookings: OwnBookingListing[] = await Promise.all(rows.map(async row => ({
    reference: row.reference,
    showTitle: row.showTitle,
    venueName: row.venueName,
    when: formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    state: qrStatusDisplay(row.status, null, saysTotalDue(row.status, row.holdExpiresAt, row.totalPence)).headline,
    url: `/qr/${await qrTokenFor(row.id)}`,
  })))

  return { bookings }
})
