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
 * GET /api/ticket-types — list ticket types. Public. Archived types are
 * excluded unless asked for (ADR-0010); they remain necessary for pricing
 * historic tickets.
 */
export default defineEventHandler(async (event) => {
  const { includeArchived } = await getValidatedQuery(event, querySchema.parse)

  const allTicketTypes = await db.query.ticketTypes.findMany({
    where: includeArchived === 'true' ? undefined : eq(schema.ticketTypes.archived, false),
    orderBy: (ticketTypes, { asc }) => [asc(ticketTypes.name)],
  })

  return allTicketTypes
})
