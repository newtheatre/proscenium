// Everything the duty manager's tonight screen shows in one call (E-112 criteria 1 and 2).
// Guarded by the DUTY_MANAGER authority: door and till have their own screens and their own guard.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')

  const performances = await Promise.all(resolved.performanceIds.map(async (performanceId) => {
    const performance = await tonightPerformance(performanceId)
    if (!performance) return null

    const capacity = effectiveCapacity({ capacityOverride: performance.capacityOverride, venueCapacity: performance.venueCapacity })
    const [house, team, warnings] = await Promise.all([
      tonightHouse(performanceId, capacity),
      tonightTeam(performanceId),
      showWarnings(performance.showId),
    ])

    return {
      performanceId,
      showTitle: performance.showTitle,
      venueName: performance.venueName,
      startsAt: performance.startsAt,
      doorsAt: performance.doorsAt,
      durationMinutes: performance.durationMinutes,
      intervalCount: performance.intervalCount,
      intervalMinutes: performance.intervalMinutes,
      latecomerPolicy: performance.latecomerPolicy,
      ageGuidance: performance.ageGuidance,
      house,
      warnings: warnings.map(warning => ({ title: warning.title, level: warning.level })),
      team,
    }
  }))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    performances: performances.filter(one => one !== null),
  }
})
