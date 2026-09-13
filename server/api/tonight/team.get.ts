// Who is on tonight, for the contacts block every show-night role reaches (E-112 criterion 2).
// A phone appears only where that member's own shift-contact consent is currently set (A-114).
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, [...NIGHT_ROLES])

  const performances = await Promise.all(resolved.performanceIds.map(async performanceId => ({
    performanceId,
    team: await tonightTeam(performanceId),
  })))

  return { night: resolved.night, venueId: resolved.venueId, performances }
})
