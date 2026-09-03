import { eq } from 'drizzle-orm'

// Delete a ticket type that has never been sold. One that has can only be archived, and the
// refusal says so (D-119 criteria 2 and 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await ticketTypeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such ticket type' })

  if (held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been sold, so it can only be archived: every ticket sold under it still has to resolve`,
    })
  }

  // The overrides are prices this type would have taken, so they go with it. Both tables restrict
  // on the foreign key, which is what makes the order matter rather than the batch.
  await db.batch([
    db.delete(schema.showTicketOverrides).where(eq(schema.showTicketOverrides.ticketTypeId, id)),
    db.delete(schema.performanceTicketOverrides).where(eq(schema.performanceTicketOverrides.ticketTypeId, id)),
    db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'ticket-type.deleted',
      target: `ticket-type:${id}`,
      detail: { name: held.name, price: held.price, kind: held.kind },
    })),
  ])

  return { ok: true }
})
