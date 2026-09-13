import { londonClock } from './london'
import type { NightRole } from './night-authority'

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

// Who is on tonight, for the contacts block (E-112 criterion 2). A shift's own role order, so
// the duty manager is always the first number somebody reaches for.
export interface ContactSlot { role: NightRole, filled: boolean, name: string | null, phone: string | null }

const ROLE_ORDER: NightRole[] = ['DUTY_MANAGER', 'DOOR', 'BAR']

// The same person covering two of tonight's performances is one row, and an unfilled slot stays
// in the list as unfilled rather than quietly vanishing from it.
export function contactRoster<T extends ContactSlot>(slots: T[]): T[] {
  const seen = new Map<string, T>()
  for (const slot of slots) {
    const key = slot.filled ? `${slot.role}:${slot.name ?? ''}` : `${slot.role}:unfilled`
    const held = seen.get(key)
    // A phone that one performance's row carries and another's does not is still a phone.
    if (!held) seen.set(key, slot)
    else if (held.phone === null && slot.phone !== null) seen.set(key, slot)
  }
  return [...seen.values()].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
}

// A number is dialled, never displayed as a link to somewhere else: a tap on a phone opens the
// dialler, and a device with no dialler simply does nothing.
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}
