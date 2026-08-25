import type { db } from '@nuxthub/db'

/**
 * Shared relational `with` shapes, so every reservation endpoint returns a
 * consistent payload.
 */

type ReservationQuery = NonNullable<Parameters<(typeof db)['query']['reservations']['findMany']>[0]>
type ReservationWith = NonNullable<ReservationQuery['with']>
type TicketQuery = NonNullable<Parameters<(typeof db)['query']['tickets']['findMany']>[0]>

/**
 * Ticket relation config: defined separately so `satisfies` provides
 * contextual typing for the `orderBy` callback parameters.
 */
const ticketsConfig = {
  with: { ticketType: { columns: { id: true, name: true, description: true } } },
  orderBy: (t, { asc }) => [asc(t.createdAt)],
} satisfies TicketQuery

/**
 * `with` clause for reservation list/summary views (no tickets).
 */
export const reservationSummaryWith = {
  // `password`/`verified` are not listed because migration 0014 dropped them:
  // naming them would read as a decision about columns that no longer exist.
  user: { columns: { id: true, name: true, email: true } },
  performance: {
    with: {
      show: { columns: { id: true, title: true, slug: true } },
      venue: { columns: { id: true, name: true } },
    },
  },
} satisfies ReservationWith

/**
 * `with` clause for detailed reservation views (with tickets).
 */
export const reservationDetailWith = {
  // `password`/`verified` are not listed because migration 0014 dropped them:
  // naming them would read as a decision about columns that no longer exist.
  user: { columns: { id: true, name: true, email: true } },
  performance: {
    with: {
      show: { columns: { id: true, title: true, slug: true } },
      venue: { columns: { id: true, name: true } },
    },
  },
  tickets: ticketsConfig,
} satisfies ReservationWith

/*
 * Customer-facing shapes. The staff shapes above must not be reused: without
 * an explicit `columns` list Drizzle returns staffNotes and legacyRef.
 */

/** Reservation columns a customer may see. Allow-list, so new columns are private by default. */
export const reservationCustomerColumns = {
  id: true,
  bookingRef: true,
  status: true,
  cancelledBy: true,
  customerNotes: true,
  performanceId: true,
  createdAt: true,
  updatedAt: true,
} as const

/** Ticket relation for customer views: carries priceConfidence so £0 legacy
 *  tickets can be shown as "not recorded" rather than "Free". */
const customerTicketsConfig = {
  columns: { id: true, pricePaid: true, priceConfidence: true, refundedAt: true },
  with: { ticketType: { columns: { id: true, name: true, description: true } } },
  orderBy: (t, { asc }) => [asc(t.createdAt)],
} satisfies TicketQuery

/** `with` clause for a customer looking at their own booking. */
export const reservationCustomerWith = {
  user: { columns: { id: true, name: true, email: true } },
  performance: {
    // Allow-listed like every relation beside it: `notes` on this table is
    // internal production detail, and without a list Drizzle returns it.
    columns: {
      id: true,
      startsAt: true,
      doorsAt: true,
      durationMinutes: true,
      intervalCount: true,
      intervalMinutes: true,
      status: true,
    },
    with: {
      show: { columns: { id: true, title: true, slug: true, posterUrl: true } },
      venue: { columns: { id: true, name: true, address: true } },
    },
  },
  tickets: customerTicketsConfig,
} satisfies ReservationWith
