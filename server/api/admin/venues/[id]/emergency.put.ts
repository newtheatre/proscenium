import { emergencyCardForm } from '#shared/utils/venue-emergency'

// A new version of a venue's card. Never an edit to the last one: append-only, versioned and
// audited (E-113 criterion 1).
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'emergency-card.write')
  const input = await readValidatedBodyOrThrow(event, emergencyCardForm)

  const venue = (await listVenues()).find(one => one.id === venueId)
  if (!venue) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

  const id = newId()
  await db.batch([
    db.run(recordCardStatement(venueId, input, resolved.account.id, id).statement),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'emergency-card.updated',
      target: `venue:${venueId}`,
    })),
  ])

  return { ok: true, id }
})
