// The current card for tonight's venue, cached on the device the moment any show-night screen
// reads it, so it opens fully offline afterwards (E-113 criteria 2, 4).
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const card = await currentCard(resolved.venueId)
  if (!card) throw createError({ statusCode: 404, statusMessage: 'This venue has no emergency card yet' })

  // Derived from tonight's confirmed shifts, never a standing list (0009), and a number appears
  // only where its holder's own shift-contact consent is set (A-114).
  const teams = await Promise.all(resolved.performanceIds.map(performanceId => tonightTeam(performanceId)))
  return { ...card, dutyManagers: dutyManagersOnCall(teams.flat()) }
})
