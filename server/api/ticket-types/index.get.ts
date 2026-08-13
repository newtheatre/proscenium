import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const querySchema = z.object({
  /**
   * Include retired types. Off by default, so every caller that just wants
   * "the ticket types" gets the live ones without having to remember.
   *
   * The management screen passes `true` for its "Show archived" toggle — it is
   * the one place that has to see them, since it is where they are archived and
   * restored.
   */
  includeArchived: z.enum(['true', 'false']).optional().default('false'),
})

/**
 * GET /api/ticket-types — list ticket types. Public.
 *
 * Archived types are excluded unless asked for. Archiving is how a type is
 * retired for good: after a decade of imports there are far more dead Fringe
 * and StuFF types than live ones, and they were cluttering every screen that
 * lists types while remaining necessary for pricing historic tickets.
 *
 * Not the same as `activeByDefault`, which only decides whether a live type is
 * pre-selected on new shows.
 */
export default defineEventHandler(async (event) => {
  const { includeArchived } = await getValidatedQuery(event, querySchema.parse)

  const allTicketTypes = await db.query.ticketTypes.findMany({
    where: includeArchived === 'true' ? undefined : eq(schema.ticketTypes.archived, false),
    orderBy: (ticketTypes, { asc }) => [asc(ticketTypes.name)],
  })

  return allTicketTypes
})
