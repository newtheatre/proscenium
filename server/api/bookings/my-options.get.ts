import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/**
 * GET /api/bookings/my-options — what this account adds to the public picker.
 * Session-dependent by design, which is why it is not in the show payload.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)

  const empty = { accessTypes: [], pass: null }
  if (!userId) return empty

  const performance = await db.select({
    id: schema.performances.id,
    showId: schema.performances.showId,
  }).from(schema.performances).where(eq(schema.performances.id, performanceId)).get()
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  const [rights, passes] = await Promise.all([
    canBookAccessTickets(userId, performanceId),
    db.select({
      id: schema.passes.id,
      reference: schema.passes.reference,
      passTypeId: schema.passes.passTypeId,
      status: schema.passes.status,
      name: schema.passTypes.name,
      validFrom: schema.passTypes.validFrom,
      validTo: schema.passTypes.validTo,
    })
      .from(schema.passes)
      .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passes.passTypeId))
      .where(and(eq(schema.passes.userId, userId), eq(schema.passes.status, 'ACTIVE'))),
  ])

  const accessTypes = rights.allowed
    ? await accessTypesFor(performance.showId, performanceId, rights)
    : []

  // The one validation rule, shared with the door (docs/10 §4). First pass
  // that covers this performance wins; holding two is not a normal case.
  let pass = null
  for (const candidate of passes) {
    const check = await canRedeem(candidate.id, performanceId)
    if (check.ok) {
      pass = { id: candidate.id, reference: candidate.reference, name: candidate.name }
      break
    }
  }

  return { accessTypes, pass }
})

/** Priced through the same override chain as any other type (ADR-0002). */
async function accessTypesFor(showId: string, performanceId: string, rights: AccessBookingRights) {
  const [types, showOverrides, perfOverrides] = await Promise.all([
    db.select().from(schema.ticketTypes).where(and(sellableTicketTypes(), inArray(schema.ticketTypes.accessKind, ['ACCESS', 'COMPANION']))),
    db.select().from(schema.showTicketTypeOverrides).where(eq(schema.showTicketTypeOverrides.showId, showId)),
    db.select().from(schema.performanceTicketTypeOverrides).where(eq(schema.performanceTicketTypeOverrides.performanceId, performanceId)),
  ])

  const ctx = { baseTypes: types, showOverrides, perfOverrides }
  return types
    .map((type) => {
      const { effectivePrice, active } = resolveEffectiveTicketType(type.id, ctx)
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        effectivePrice,
        active,
        accessKind: type.accessKind,
        // What is left here, not the entitlement.
        maxQuantity: type.accessKind === 'COMPANION' ? rights.companionsRemaining : rights.accessRemaining,
      }
    })
    .filter(type => type.active && type.maxQuantity > 0)
}
