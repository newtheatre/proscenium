import { z } from 'zod'
import { committeeYearEnd, committeeYearOf } from './london'

// Booked rooms nobody turned up to, and what they cost (C-116). The old app promised no-show
// tracking and never built it, so an empty booked room cost nothing at all (RM-1).

export const NO_SHOW_REASON_LIMIT = 500

export const NO_SHOW_KINDS = ['RECORDED', 'WITHDRAWN'] as const
export type NoShowKind = (typeof NO_SHOW_KINDS)[number]

export type Standing = 'CLEAR' | 'RECORDED' | 'PRE_APPROVAL'

export interface Ladder {
  recordAt: number
  preApprovalAt: number
}

// Where a count puts somebody. Configuration decides both steps, so a committee changing the
// numbers changes the ladder without a deploy (0012).
export function standingFor(count: number, ladder: Ladder): Standing {
  if (count >= ladder.preApprovalAt) return 'PRE_APPROVAL'
  if (count >= ladder.recordAt) return 'RECORDED'
  return 'CLEAR'
}

export function saysStanding(standing: Standing, count: number, ladder: Ladder): string {
  if (standing === 'PRE_APPROVAL') {
    return `Every booking you make is checked by a person first, because ${count} were not turned up to.`
  }
  if (standing === 'RECORDED') {
    return `${count} bookings were not turned up to. At ${ladder.preApprovalAt}, every booking is checked by a person first.`
  }
  return count === 1
    ? 'One booking was not turned up to. Nothing follows from it yet.'
    : 'Nothing on your record.'
}

// Rolling, and never further back than the committee year: a June no-show survives the July
// handover, and one from two committees ago does not follow somebody about (0009, 0014).
export function windowStart(now: Date, days: number): number {
  const rolling = Math.floor(now.getTime() / 1000) - days * 86_400
  const yearStart = Math.floor(committeeYearEnd(committeeYearOf(now) - 1).getTime() / 1000) + 1
  return Math.max(rolling, yearStart)
}

// A booking that has not happened yet cannot have been missed, and one nobody held cannot either.
export function refusalToRecord(booking: { status: string, endsAt: number }, now: number): string | null {
  if (booking.status !== 'CONFIRMED') return 'Only a confirmed booking can be marked as a no-show'
  if (booking.endsAt > now) return 'That booking has not happened yet'
  return null
}

export const noShowForm = z.object({
  // Optional on a recording, required on a withdrawal, which the route enforces.
  reason: z.string().trim().max(NO_SHOW_REASON_LIMIT).nullish().transform(value => (value ?? '').trim() || null),
})

export const withdrawForm = z.object({
  reason: z.string().trim().min(1, 'Say why it is being withdrawn').max(NO_SHOW_REASON_LIMIT),
})
