import { accessTonight, passPressure } from './tonight-glance'
import { tonightHouse, tonightPerformance } from './tonight'
import type { AccessTonight } from './tonight-glance'
import type { TonightHouse } from './tonight'

// One performance as every show-night role reads it: the house, the show information and the
// pass pressure (E-112 criterion 1, issue 1307). Access wording only where the caller may see it.

export interface TonightView {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  latecomerPolicy: string | null
  ageGuidance: string | null
  house: TonightHouse
  passesCovering: number
  access: AccessTonight[] | null
  warnings: { title: string, level: string | null }[]
  contentNotes: string | null
}

export async function tonightView(performanceId: string, withAccess: boolean): Promise<TonightView | null> {
  const performance = await tonightPerformance(performanceId)
  if (!performance) return null

  const capacity = effectiveCapacity({ capacityOverride: performance.capacityOverride, venueCapacity: performance.venueCapacity })
  const [house, warnings, passesCovering, access] = await Promise.all([
    tonightHouse(performanceId, capacity),
    showWarnings(performance.showId),
    passPressure(performanceId, performance.showId),
    withAccess ? accessTonight(performanceId) : Promise.resolve(null),
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
  }
}
