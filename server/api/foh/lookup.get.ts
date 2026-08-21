import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isStaff, workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

const REF = /^[A-Z0-9]{6}$/i

/**
 * GET /api/foh/lookup — find a booking on tonight's performances, by
 * reference, name or email. Scoped to tonight by design (ADR-0019).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { q } = await getValidatedQuery(event, querySchema.parse)

  // Every scope here is a subquery, never an id list: no statement's bound
  // parameter count may grow with the rows it covers (ADR-0006).
  const visiblePerformances = db.select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      // gte/lte, not a raw template: `startsAt` is stored as integer seconds
      // and only the typed helpers convert a Date to it.
      gte(schema.performances.startsAt, validityStart(scope.night)),
      lte(schema.performances.startsAt, validityEnd(scope.night)),
      ne(schema.performances.status, 'CANCELLED'),
      scope.bypassedRota
        ? sql`1 = 1`
        : sql`exists (
            select 1 from performance_shifts ps
            where ps.performance_id = ${schema.performances.id}
              and ps.user_id = ${user.id}
              and ps.status = 'CONFIRMED'
          )`,
    ))

  const term = q.trim()
  const matchingUsers = db.select({ id: schema.users.id })
    .from(schema.users)
    .where(or(likeInsensitive(schema.users.name, term), likeInsensitive(schema.users.email, term)))

  const matches = and(
    inArray(schema.reservations.performanceId, visiblePerformances),
    REF.test(term)
      ? eq(schema.reservations.bookingRef, term.toUpperCase())
      : inArray(schema.reservations.userId, matchingUsers),
  )

  const rows = await db.select({
    id: schema.reservations.id,
    bookingRef: schema.reservations.bookingRef,
    status: schema.reservations.status,
    customerName: schema.users.name,
    customerEmail: schema.users.email,
    performanceId: schema.performances.id,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
    venueName: schema.venues.name,
  })
    .from(schema.reservations)
    .innerJoin(schema.users, eq(schema.reservations.userId, schema.users.id))
    .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .where(matches)
    .orderBy(asc(schema.performances.startsAt))
    .limit(10)

  if (!rows.length) return []

  // Second pass for tickets, scoped by the same predicate rather than by the
  // ids just returned, so this cannot breach the parameter cap either.
  const ticketRows = await db.select({
    reservationId: schema.tickets.reservationId,
    pricePaid: schema.tickets.pricePaid,
    refundedAt: schema.tickets.refundedAt,
    ticketTypeName: schema.ticketTypes.name,
  })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .leftJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
    .where(matches)

  const ticketsByReservation = new Map<string, typeof ticketRows>()
  for (const ticket of ticketRows) {
    const list = ticketsByReservation.get(ticket.reservationId)
    if (list) list.push(ticket)
    else ticketsByReservation.set(ticket.reservationId, [ticket])
  }

  const staff = isStaff(user)

  return rows.map((reservation) => {
    const tickets = ticketsByReservation.get(reservation.id) ?? []
    const standing = bookingStanding({ status: reservation.status, tickets })
    const base = {
      id: reservation.id,
      bookingRef: reservation.bookingRef,
      status: reservation.status,
      performance: {
        id: reservation.performanceId,
        startsAt: reservation.startsAt,
        showTitle: reservation.showTitle,
        venueName: reservation.venueName,
      },
    }

    // The door admits or redirects. It gets the verdict and the head count and
    // no money at all, including what is owed: that is the bar's figure (§2.1).
    if (!staff) {
      return {
        ...base,
        standing: { state: standing.state, partySize: standing.partySize },
        firstName: reservation.customerName.split(' ')[0] ?? '',
      }
    }

    return {
      ...base,
      standing,
      customerName: reservation.customerName,
      customerEmail: reservation.customerEmail,
      tickets: tickets.map(ticket => ({
        pricePaid: ticket.pricePaid,
        refundedAt: ticket.refundedAt,
        ticketTypeName: ticket.ticketTypeName,
      })),
    }
  })
})
