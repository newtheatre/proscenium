import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

interface BookingPerformance {
  startsAt: Date
  show: { id: string, title: string, slug: string }
  venue: { id: string, name: string }
}

interface BookingRow {
  id: string
  bookingRef: string
  performanceId: string
  userId: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  cancelledBy: 'CUSTOMER' | 'STAFF' | null
  customerNotes: string | null
  staffNotes: string | null
  legacyRef: string | null
  source: 'WEB' | 'BOX_OFFICE' | 'DOOR' | 'LEGACY_IMPORT'
  originalQuantity: number | null
  anonymisedAt: string | null
  createdAt: string
  updatedAt: string
  performance: BookingPerformance
  user: { id: string, name: string, email: string }
  tickets: Array<{
    id: string
    pricePaid: number
    ticketType: { id: string, name: string, description: string | null }
  }>
}

/**
 * GET /api/bookings/my — get the current user's bookings.
 *
 * Requires authentication. Returns upcoming and past bookings.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id
  const now = new Date()

  const bookings = await db.query.reservations.findMany({
    where: (r, { eq }) => eq(r.userId, userId),
    orderBy: [desc(schema.reservations.createdAt)],
    with: reservationDetailWith,
  }) as BookingRow[]

  // Split into upcoming and past based on performance start time
  const upcoming = bookings.filter(
    b => new Date(b.performance.startsAt) > now && !['CANCELLED', 'NO_SHOW'].includes(b.status),
  )
  const past = bookings.filter(
    b => new Date(b.performance.startsAt) <= now || ['CANCELLED', 'NO_SHOW'].includes(b.status),
  )

  return { upcoming, past }
})
