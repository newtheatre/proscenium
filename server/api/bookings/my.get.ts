import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, gt, inArray, not, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = paginationSchema.extend({
  upcoming: z.enum(['true', 'false']).optional().default('true'),
})

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

/** GET /api/bookings/my: one page of the caller's own bookings, upcoming or past. */
export default defineEventHandler(async (event) => {
  // Identity only: this handler reads no role, so it must not be gated on role
  // staleness (ADR-0008).
  const { id: userId } = await requireSessionUser(event)
  const { page, limit, upcoming } = await getValidatedQuery(event, querySchema.parse)
  const wantUpcoming = upcoming === 'true'

  // A subquery, never an id list: the parameter count must not grow with the
  // rows covered (ADR-0006).
  const futurePerformances = db.select({ id: schema.performances.id })
    .from(schema.performances)
    .where(gt(schema.performances.startsAt, new Date()))

  const stillToCome = and(
    inArray(schema.reservations.performanceId, futurePerformances),
    notInArray(schema.reservations.status, ['CANCELLED', 'NO_SHOW']),
  )!

  // Exact complements, so no booking falls into both lists or neither.
  const where = and(
    eq(schema.reservations.userId, userId),
    wantUpcoming ? stillToCome : not(stillToCome),
  )

  // Inner names are identifiers, not columns: a relational query rewrites every
  // Column it is given to the root table (ADR-0046).
  const startsAt = sql`(select ${schema.performances}.${sql.identifier(schema.performances.startsAt.name)} from ${schema.performances} where ${schema.performances}.${sql.identifier(schema.performances.id.name)} = ${schema.reservations.performanceId})`

  const [rows, totals] = await Promise.all([
    db.query.reservations.findMany({
      where: () => where,
      // Upcoming reads by when you turn up, not by when you booked.
      orderBy: wantUpcoming ? [asc(startsAt)] : [desc(startsAt)],
      columns: reservationCustomerColumns,
      with: reservationCustomerWith,
      limit,
      offset: offsetFor({ page, limit }),
    }),
    db.select({ value: count() }).from(schema.reservations).where(where),
  ])

  return paginated(rows as BookingRow[], totals[0]?.value ?? 0, { page, limit })
})
