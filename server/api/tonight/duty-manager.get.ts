import { z } from 'zod'

// The glance asks for tonight's access wording; the hub, polling for the house, does not. A venue
// narrows a night when two are running, as the authority route's own scope does (E-127).
const query = z.object({ access: yesOrNo.optional(), venueId: z.string().min(1).optional() })

// Everything the duty manager's tonight screen shows in one call (E-112 criteria 1 and 2).
// Guarded by the DUTY_MANAGER authority: door and till have their own screens and their own guard.
export default defineEventHandler(async (event) => {
  const { access: withAccess = false, venueId } = await getValidatedQueryOrThrow(event, query)
  // Decrypting access wording (D-127) is the one read an officer's bypass records (0098).
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', venueId ? { venueId } : {}, { recordsRead: withAccess })

  const performances = await Promise.all(resolved.performanceIds.map(async (performanceId) => {
    const performance = await tonightPerformance(performanceId)
    if (!performance) return null

    const capacity = effectiveCapacity({ capacityOverride: performance.capacityOverride, venueCapacity: performance.venueCapacity })
    const [house, team, warnings, passesCovering, access] = await Promise.all([
      tonightHouse(performanceId, capacity),
      tonightTeam(performanceId),
      showWarnings(performance.showId),
      passPressure(performanceId, performance.showId),
      // Only when asked, so the wording is never read without the read being recorded.
      withAccess ? accessTonight(performanceId) : Promise.resolve([]),
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
      passesCovering,
      access,
      warnings: warnings.map(warning => ({ title: warning.title, level: warning.level })),
      contentNotes: performance.contentNotes,
      team,
    }
  }))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    performances: performances.filter(one => one !== null),
  }
})
