import { sql } from 'drizzle-orm'

// Cancel a performance. This is the only way out for one that has sold seats, and the count it
// returns is what the refund workflow (D-116) and the holder notification (D-107) will act on.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  if (held.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'This performance is already cancelled' })
  }

  // The predicate rides the UPDATE, so two officers cancelling at once write one cancellation and
  // one audit entry rather than two (0003).
  await db.batch([
    db.run(sql`UPDATE performances SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${id} AND status <> 'CANCELLED'`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.cancelled',
      target: `performance:${id}`,
      detail: {
        showId: held.showId,
        night: performanceNight(held.startsAt),
        // Counted from the tables that reference the performance, so it is nought only while no
        // such table exists (D-121 criterion 5).
        ticketsOwedARefund: held.soldTickets,
      },
    })),
  ])

  return { ok: true, status: 'CANCELLED', ticketsOwedARefund: held.soldTickets }
})
