import { eq } from 'drizzle-orm'
import { priceOverridesForm } from '#shared/utils/ticket-types'

// Set this performance's price overrides. A change takes effect for new reservations only: every
// ticket already sold carries its own snapshot (D-120 criteria 3 and 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const input = await readValidatedBodyOrThrow(event, priceOverridesForm)
  const held = await performancePrices(id)
  const { setting, detail } = overridesToWrite(held, input.overrides, 'performancePrice', 'performanceActive')

  await db.batch([
    db.delete(schema.performanceTicketOverrides).where(eq(schema.performanceTicketOverrides.performanceId, id)),
    ...setting.map(override => db.insert(schema.performanceTicketOverrides).values({
      id: newId(),
      performanceId: id,
      ticketTypeId: override.ticketTypeId,
      price: override.price,
      active: override.active,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.prices.set',
      target: `performance:${id}`,
      detail,
    })),
  ])

  return { ok: true }
})
