import { db, schema } from '@nuxthub/db'
import { eq, isNotNull, or, sql } from 'drizzle-orm'

/**
 * Who sells the tickets. One answer, used by every path that could take money
 * for a seat we do not control (ADR-0029).
 */

/**
 * A performance is externally ticketed when it is at someone else's venue, or
 * when the show carries its own link. A hire in our building is neither.
 */
export function externallyTicketed(performance: {
  externalBookingUrl?: string | null
  venue: { isExternal: boolean }
  show: { externalUrl: string | null }
}): boolean {
  return performance.venue.isExternal
    || Boolean(performance.externalBookingUrl)
    || performance.show.externalUrl !== null
}

/**
 * Where to send someone instead. The performance wins, because a show that
 * transfers is sold by us here and by them there. Null means it is a dead end.
 */
export function externalBookingUrl(performance: {
  externalBookingUrl?: string | null
  show: { externalUrl: string | null }
}): string | null {
  return performance.externalBookingUrl || performance.show.externalUrl
}

/**
 * SQL predicate for "this performance is ours to sell". Correlated subquery on
 * the venue, so no statement's parameters follow the result set (ADR-0006).
 */
export function ourTicketingPredicate() {
  return sql`${schema.performances.externalBookingUrl} is null and not exists (
    select 1 from shows s
    where s.id = ${schema.performances.showId} and s.external_url is not null
  ) and not exists (
    select 1 from venues v
    where v.id = ${schema.performances.venueId} and v.is_external = 1
  )`
}

/** The same question for one performance, when the row is not already loaded. */
export async function isExternallyTicketed(performanceId: string): Promise<boolean> {
  const row = await db.select({ id: schema.performances.id })
    .from(schema.performances)
    .innerJoin(schema.shows, eq(schema.shows.id, schema.performances.showId))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.performances.venueId))
    .where(sql`${schema.performances.id} = ${performanceId} and (${or(
      isNotNull(schema.shows.externalUrl),
      eq(schema.venues.isExternal, true),
    )})`)
    .get()
  return Boolean(row)
}
