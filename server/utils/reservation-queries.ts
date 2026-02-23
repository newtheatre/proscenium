import type { db } from 'hub:db'

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
