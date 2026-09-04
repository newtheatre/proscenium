import { currentShowNight, showNightBounds } from '#shared/utils/show-night'

// Stamp a venue's template onto every performance from tonight onwards that is missing a slot.
// Running it twice adds nothing the second time (E-102 criterion 2).
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'venueId') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const slots = await templateSlotsFor(venueId)
  if (slots.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'This venue has no template, so there is nothing to stamp' })
  }

  // A night that has already begun is still tonight's work, so the window opens at 04:00 rather
  // than at this moment (0014, E-110).
  const night = currentShowNight()
  const from = Math.floor(showNightBounds(night).from.getTime() / 1000)

  // The entry records the action and its scope; how many shifts it added is a screen figure, and
  // the rows themselves carry when they were stamped.
  const [stamped] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string }>(backfillVenueStatement(venueId, from)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'shift.stamped',
      target: `venue:${venueId}`,
      detail: { venueId, from: night },
    })),
  ]))

  return { ok: true, stamped: stamped.length }
})
