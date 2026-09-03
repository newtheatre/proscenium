import { eq } from 'drizzle-orm'

// Delete a performance nothing has been sold against. One that has sold seats is cancelled
// instead, and the refusal says so (D-121 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  if (held.soldTickets > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${plural(held.soldTickets, 'ticket')} have been sold for this performance, so it can only be cancelled: everybody holding one has to be refunded and told`,
    })
  }

  // A shift cascades at the foreign key, so deleting would take a volunteer's evening with it
  // and tell nobody. Cancelling is what notifies them (E-102 criterion 4).
  const staffed = await heldShiftCount(id)
  if (staffed > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${plural(staffed, 'shift')} on this performance have been taken, so it can only be cancelled: everybody working it has to be told`,
    })
  }

  // The price overrides cascade at the foreign key, so the performance takes its own with it.
  await db.batch([
    db.delete(schema.performances).where(eq(schema.performances.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.deleted',
      target: `performance:${id}`,
      detail: { showId: held.showId, night: performanceNight(held.startsAt), venueId: held.venueId },
    })),
  ])

  return { ok: true }
})
