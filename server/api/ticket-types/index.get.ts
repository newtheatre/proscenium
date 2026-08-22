import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  /**
   * Off by default, so a caller that just wants the ticket types gets the live
   * ones. Only the management screen asks for retired ones.
   */
  includeArchived: z.enum(['true', 'false']).optional().default('false'),
})

/**
 * GET /api/ticket-types: list ticket types.
 */
export default defineEventHandler(async (event) => {
  const { includeArchived } = await getValidatedQuery(event, querySchema.parse)

  const allTicketTypes = await db.query.ticketTypes.findMany({
    where: includeArchived === 'true' ? undefined : eq(schema.ticketTypes.archived, false),
    orderBy: (ticketTypes, { asc }) => [asc(ticketTypes.name)],
  })

  return allTicketTypes
})
