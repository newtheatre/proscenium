import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

interface BookingPerformance {
  startsAt: Date
  show: { id: string, title: string, slug: string, posterUrl: string | null }
  venue: { id: string, name: string, address: string | null }
}

/**
 * Customer-facing shape: staffNotes, legacyRef, source, originalQuantity and
 * anonymisedAt are internal and must not reach it.
 */
interface BookingRow {
  id: string
  bookingRef: string
  performanceId: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  cancelledBy: 'CUSTOMER' | 'STAFF' | null
  customerNotes: string | null
  createdAt: string
  updatedAt: string
  performance: BookingPerformance
  user: { id: string, name: string, email: string }
  tickets: Array<{
    id: string
    pricePaid: number
    priceConfidence: 'EXACT' | 'DERIVED' | 'UNKNOWN'
    refundedAt: Date | null
    ticketType: { id: string, name: string, description: string | null }
  }>
}

/**
 * GET /api/bookings/my — get the current user's bookings.
 *
 * Requires authentication. Returns upcoming and past bookings.
 */
export default defineEventHandler(async (event) => {
  // Identity only — this handler reads no role, so it must not be gated on role
  // staleness (ADR-0008).
  const { id: userId } = await requireSessionUser(event)
  const now = new Date()

  const bookings = await db.query.reservations.findMany({
    where: (r, { eq }) => eq(r.userId, userId),
    orderBy: [desc(schema.reservations.createdAt)],
    columns: reservationCustomerColumns,
    with: reservationCustomerWith,
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
