import { londonClock } from './london'

// Which of tonight's performances a duty manager covering more than one is looking at right now
// (E-127 criterion 2). A venue running two performances needs one one-tap answer to "which".

export interface RunningPerformance { performanceId: string, startsAt: number, doorsAt: number | null }

// A performance is active from its own doors (or curtain, with none set) until the next one's
// doors begin, so this needs no duration estimate; the edges resolve to next-to-come or last-run.
export function activePerformanceId<T extends RunningPerformance>(performances: T[], at: number): string | null {
  if (performances.length === 0) return null
  const sorted = [...performances].sort((a, b) => a.startsAt - b.startsAt)

  let active = sorted[0]!
  for (const performance of sorted) {
    const windowStart = performance.doorsAt ?? performance.startsAt
    if (at < windowStart) break
    active = performance
  }
  return active.performanceId
}

// What a show-night picker puts on a performance. A database id tells a volunteer at the door
// nothing about which house they are admitting into (issue 901).
export interface PerformanceChoice { showTitle: string, startsAt: number }

export function saysPerformanceChoice(performance: PerformanceChoice): string {
  return `${performance.showTitle}, ${londonClock(new Date(performance.startsAt * 1000))}`
}
