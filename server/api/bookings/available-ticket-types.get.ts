import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createReservation } from '~~/shared/utils/abilities'

/**
 * GET /api/bookings/available-ticket-types — effective prices and active state
 * for a performance, before any reservation exists.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, createReservation)

  const query = getQuery(event)
  const performanceId = query.performanceId as string | undefined
  // Staff sell to somebody else, so the entitlement asked about is the
  // booker's. Without it the desk sees its own rights and the write refuses.
  const forUserId = query.forUserId as string | undefined

  if (!performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'performanceId query parameter is required' })
  }

  // Resolve showId from the performance
  const perf = await db
    .select({ showId: schema.performances.showId })
    .from(schema.performances)
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  const showId = perf.showId

  // Only types a human may sell: archived legacy types and the pass
  // bookkeeping kinds are excluded. See sellableTicketTypes().
  const allTypes = await db.select().from(schema.ticketTypes).where(sellableTicketTypes())
  const typeIds = allTypes.map(t => t.id)

  // Load show-level and performance-level overrides
  const [showOverrides, perfOverrides] = await Promise.all([
    typeIds.length > 0
      ? db.select().from(schema.showTicketTypeOverrides).where(
          and(
            eq(schema.showTicketTypeOverrides.showId, showId),
            inArray(schema.showTicketTypeOverrides.ticketTypeId, typeIds),
          ),
        )
      : Promise.resolve([]),
    typeIds.length > 0
      ? db.select().from(schema.performanceTicketTypeOverrides).where(
          and(
            eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
            inArray(schema.performanceTicketTypeOverrides.ticketTypeId, typeIds),
          ),
        )
      : Promise.resolve([]),
  ])

  // Access types are offered only to accounts entitled to them. The gate on
  // the booking route is the real one; this keeps the picker honest.
  const session = await getUserSession(event)
  const rights = await canBookAccessTickets(forUserId ?? session?.user?.id, performanceId)

  const ctx = { baseTypes: allTypes, showOverrides, perfOverrides }
  return allTypes
    .filter(type => !type.accessKind || rights.allowed)
    .map((type) => {
      const { effectivePrice, active } = resolveEffectiveTicketType(type.id, ctx)
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        effectivePrice,
        active,
        accessKind: type.accessKind,
        // What is left at this performance, not the entitlement: the picker
        // should not offer a companion the booker has already used.
        maxQuantity: type.accessKind === 'COMPANION'
          ? rights.companionsRemaining
          : type.accessKind === 'ACCESS' ? rights.accessRemaining : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})
