import { sql } from 'drizzle-orm'
import { performanceSaleForm } from '#shared/utils/programme'

// Put one performance on or off sale, independently of its show and of every other performance
// of it: two venues may run at once and a day may hold a matinee and an evening (D-121, E-127).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const { onSale } = await readValidatedBodyOrThrow(event, performanceSaleForm)

  // A cancelled performance is not put back by a sale action: it is cancelled, and reinstating one
  // is a decision D-118 owns.
  if (held.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'This performance has been cancelled, so it cannot be put on sale' })
  }

  const status = onSale ? 'ON_SALE' : 'DRAFT'
  if (status === held.status) {
    throw createError({ statusCode: 409, statusMessage: onSale ? 'This performance is already on sale' : 'This performance is already off sale' })
  }

  // An externally ticketed performance sells nowhere internally, so putting it on sale would say
  // something untrue on every internal screen (D-122 criterion 1).
  if (onSale && held.externalBookingUrl) {
    throw createError({
      statusCode: 409,
      statusMessage: `Tickets for this performance are sold at ${held.externalBookingUrl}, so it cannot go on sale here`,
    })
  }

  await db.batch([
    db.run(sql`UPDATE performances SET status = ${status}, updated_at = unixepoch() WHERE id = ${id} AND status <> 'CANCELLED'`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: onSale ? 'performance.on-sale' : 'performance.off-sale',
      target: `performance:${id}`,
      detail: { showId: held.showId, night: performanceNight(held.startsAt), soldTickets: held.soldTickets },
    })),
  ])

  return { ok: true, status }
})
