import { eq } from 'drizzle-orm'
import { priceOverridesForm } from '#shared/utils/ticket-types'

// Set this show's price overrides. A change takes effect for new reservations only: every ticket
// already sold carries its own snapshot, so nothing here reprices one (D-120 criteria 3 and 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const show = await showById(id)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const input = await readValidatedBodyOrThrow(event, priceOverridesForm)
  const held = await showPrices(id)
  const { setting, detail } = overridesToWrite(held, input.overrides, 'showPrice', 'showActive')

  await db.batch([
    db.delete(schema.showTicketOverrides).where(eq(schema.showTicketOverrides.showId, id)),
    ...setting.map(override => db.insert(schema.showTicketOverrides).values({
      id: newId(),
      showId: id,
      ticketTypeId: override.ticketTypeId,
      price: override.price,
      active: override.active,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show.prices.set',
      target: `show:${id}`,
      detail,
    })),
  ])

  return { ok: true }
})
