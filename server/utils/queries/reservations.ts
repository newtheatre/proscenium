import type { db } from '@nuxthub/db'

/**
 * Shared Drizzle relational query includes for reservation responses.
 *
 * These objects define the `with` clause shapes used across reservation endpoints
 * so every consumer returns a consistent shape.
 *
 * Types are extracted from the actual `db.query` signatures via `import type`,
 * ensuring they stay in sync with the schema.
 */

type ReservationQuery = NonNullable<Parameters<(typeof db)['query']['reservations']['findMany']>[0]>
type ReservationWith = NonNullable<ReservationQuery['with']>
type TicketQuery = NonNullable<Parameters<(typeof db)['query']['tickets']['findMany']>[0]>

/**
 * Ticket relation config — defined separately so `satisfies` provides
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
  user: { columns: { id: true, name: true, email: true, password: false, verified: true } },
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
  user: { columns: { id: true, name: true, email: true, password: false, verified: true } },
  performance: {
    with: {
      show: { columns: { id: true, title: true, slug: true } },
      venue: { columns: { id: true, name: true } },
    },
  },
  tickets: ticketsConfig,
} satisfies ReservationWith

/* ------------------------------------------------------------------ *
 * Customer-facing shapes
 *
 * The shapes above are for staff. Customer endpoints must not reuse them:
 * without an explicit `columns` list Drizzle returns every reservation column,
 * which includes `staffNotes` ("Internal box-office notes — not visible to the
 * customer") and `legacyRef`.
 *
 * `legacyRef` matters especially: 21,804 imported reservations belong to
 * anonymised bookers and every one carries the legacy code that, together with
 * the import artifacts, re-identifies them. And 12 imported `staffNotes` quote
 * another customer's name verbatim.
 * ------------------------------------------------------------------ */

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

/** Ticket relation for customer views — carries priceConfidence so £0 legacy
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
    with: {
      show: { columns: { id: true, title: true, slug: true, posterUrl: true } },
      venue: { columns: { id: true, name: true, address: true } },
    },
  },
  tickets: customerTicketsConfig,
} satisfies ReservationWith
