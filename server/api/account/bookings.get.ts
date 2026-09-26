import { formatLondon } from '#shared/utils/london'
import { nothingToCollect, ownBookingsFrom, qrStatusDisplay } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'

// The listing is a page of the soonest, not a history: the booking page itself holds the rest.
const LISTED = 20

// A signed-in person's own bookings still to come (issue 1332), each opening its booking page
// through the link route, which exchanges the token for the cookie as an emailed link does (D-108).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const rows = await ownBookings(account.id, ownBookingsFrom(new Date()), LISTED)

  const bookings = await Promise.all(rows.map(async (row) => {
    const totalDue = row.status === 'PENDING' && !nothingToCollect(row.holdExpiresAt, row.totalPence) ? saysPrice(row.totalPence) : null
    return {
      reference: row.reference,
      showTitle: row.showTitle,
      venueName: row.venueName,
      startsAt: row.startsAt,
      when: formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      state: qrStatusDisplay(row.status, null, totalDue).headline,
      url: `/qr/${await qrTokenFor(row.id)}`,
    }
  }))

  return { bookings }
})
