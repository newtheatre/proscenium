// Everything the duty manager's tonight screen shows in one call (E-112 criteria 1 and 2): what every
// role reads (`tonightView`), with the access wording and tonight's team besides.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')

  const performances = await Promise.all(resolved.performanceIds.map(async (performanceId) => {
    const [view, team] = await Promise.all([tonightView(performanceId, true), tonightTeam(performanceId)])
    return view ? { ...view, access: view.access ?? [], team } : null
  }))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    performances: performances.filter(one => one !== null),
  }
})
