import type { H3Event } from 'h3'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// Bars a holder may add to their own tab at: those with tonight's till open (F-108 criterion 7).
export function barsOpenTonightQuery(night: string): SQL {
  return sql`
    SELECT s.venue_id AS venueId, v.name AS name FROM till_sessions s JOIN venues v ON v.id = s.venue_id
    WHERE s.night = ${night} AND s.closed_at IS NULL
    ORDER BY v.name COLLATE NOCASE
  `
}

export function barsOpenTonight(night: string): Promise<{ venueId: string, name: string }[]> {
  return db.all<{ venueId: string, name: string }>(barsOpenTonightQuery(night))
}

// Only an authorised holder runs a tab; anybody else is told so rather than shown an empty bar.
export async function requireOwnTabHolder(event: H3Event, accountId: string): Promise<{ id: string, name: string }> {
  const holder = await authorisedTabHolder(event, accountId)
  if (!holder) throw createError({ statusCode: 403, statusMessage: 'You are not authorised to run a tab, so there is nothing to add to' })
  return holder
}
