// The current card for tonight's venue, cached on the device the moment any show-night screen
// reads it, so it opens fully offline afterwards (E-113 criteria 2, 4).
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const card = await currentCard(resolved.venueId)
  if (!card) throw createError({ statusCode: 404, statusMessage: 'This venue has no emergency card yet' })
  return card
})
