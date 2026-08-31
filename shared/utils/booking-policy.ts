import { londonClock, londonParts, londonWeekday } from './london'
import { closedOn, isOpenAt } from './rooms'
import type { RoomHours } from './rooms'

// Booking policy, enforced where it is published (C-106). Pure: the API is the authority and the
// screen mirrors it, so both read the same verdict from the same function.

export const REFUSALS = [
  'IN_THE_PAST',
  'ROOM_RETIRED',
  'ROOM_CLOSED',
  'OUT_OF_HOURS',
  'TOO_SHORT',
  'TOO_LONG',
  'SHORT_NOTICE',
  'BEYOND_HORIZON',
  'OVER_CAP',
  'NO_MEMBERSHIP',
] as const

export type Refusal = (typeof REFUSALS)[number]

// A lapsed membership is not something an approver can wave through, so it alone is not divertible
// into a request (C-105 criterion 4, C-108).
const NOT_DIVERTIBLE: readonly Refusal[] = ['NO_MEMBERSHIP', 'IN_THE_PAST', 'ROOM_RETIRED']

export interface Failure {
  reason: Refusal
  says: string
}

export interface Proposal {
  startsAt: Date
  endsAt: Date
}

export interface EstatePolicy {
  minBookingMinutes: number
  maxBookingHours: number
  noticeHours: number
  horizonWeeks: number
  activeBookingsCap: number
  maxBookingAdminsExempt: boolean
}

export interface PolicyOverrides {
  minBookingMinutes: number | null
  maxBookingHours: number | null
  noticeHours: number | null
  horizonWeeks: number | null
  activeBookingsCap: number | null
}

export interface RoomUnderPolicy extends PolicyOverrides {
  isActive: boolean
  sensitive: boolean
  // Somebody else's room: this system records the request, the Theatre Manager books it.
  isExternal: boolean
  hours: RoomHours[]
}

export type Source = 'room' | 'estate'

export interface ResolvedPolicy extends EstatePolicy {
  from: Record<keyof PolicyOverrides, Source>
}

export interface Context {
  now: Date
  isAdmin: boolean
  hasMembership: boolean
  activeBookings: number
}

export interface Verdict {
  failures: Failure[]
  // A sensitive room queues even with nothing wrong, which is why this is not a boolean pass.
  needsApproval: boolean
  // Nothing an approver could agree to, so it is not offered as a request.
  refusedOutright: boolean
}

const OVERRIDABLE = ['minBookingMinutes', 'maxBookingHours', 'noticeHours', 'horizonWeeks', 'activeBookingsCap'] as const

// Nought is an override meaning none needed, so absence is tested rather than falsiness.
export function resolvePolicy(room: PolicyOverrides, estate: EstatePolicy): ResolvedPolicy {
  const from = {} as Record<keyof PolicyOverrides, Source>
  const resolved = { ...estate } as ResolvedPolicy

  for (const key of OVERRIDABLE) {
    const override = room[key]
    from[key] = override === null || override === undefined ? 'estate' : 'room'
    if (from[key] === 'room') resolved[key] = override as number
  }

  return { ...resolved, from }
}

// London wall clock, not milliseconds: the hour that happens twice in October is two hours of a
// person's evening, and the one that never happens in March is none of it (0014).
export function spanMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)
}

function hoursOfNotice(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000
}

function weeksAhead(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / (7 * 24 * 3_600_000)
}

export function judge(proposal: Proposal, policy: EstatePolicy, room: RoomUnderPolicy, context: Context): Verdict {
  const failures: Failure[] = []
  const fail = (reason: Refusal, says: string): number => failures.push({ reason, says })

  const minutes = spanMinutes(proposal.startsAt, proposal.endsAt)
  const weekday = londonWeekday(proposal.startsAt)

  if (!context.hasMembership) {
    fail('NO_MEMBERSHIP', 'Booking a room needs a current membership. Renew it at the Students\' Union.')
  }
  if (proposal.endsAt.getTime() <= context.now.getTime()) {
    fail('IN_THE_PAST', 'That slot has already happened.')
  }
  if (!room.isActive) {
    fail('ROOM_RETIRED', 'That room is no longer in use.')
  }

  // A room with no hours recorded is open; one that has said when it opens is shut outside them.
  if (closedOn(room.hours, weekday)) {
    fail('ROOM_CLOSED', 'The room is closed that day.')
  }
  else if (!isOpenAt(room.hours, weekday, londonClock(proposal.startsAt), londonClock(proposal.endsAt))) {
    fail('OUT_OF_HOURS', 'That is outside the hours the room opens.')
  }

  if (minutes < policy.minBookingMinutes) {
    fail('TOO_SHORT', `The shortest booking is ${policy.minBookingMinutes} minutes.`)
  }

  const exempt = context.isAdmin && policy.maxBookingAdminsExempt
  if (!exempt && minutes > policy.maxBookingHours * 60) {
    fail('TOO_LONG', `The longest booking is ${policy.maxBookingHours} hours.`)
  }

  if (hoursOfNotice(proposal.startsAt, context.now) < policy.noticeHours) {
    fail('SHORT_NOTICE', `Booking needs ${policy.noticeHours} hours' notice. Ask, and somebody will decide.`)
  }

  if (weeksAhead(proposal.startsAt, context.now) > policy.horizonWeeks) {
    fail('BEYOND_HORIZON', `Bookings open ${policy.horizonWeeks} weeks ahead.`)
  }

  if (context.activeBookings >= policy.activeBookingsCap) {
    fail('OVER_CAP', `You already hold ${policy.activeBookingsCap} bookings, which is the limit.`)
  }

  const refusedOutright = failures.some(failure => NOT_DIVERTIBLE.includes(failure.reason))
  // An external room is booked by the Theatre Manager filling in the SU's form, so a member's
  // booking is always a request for somebody to do that (C-101, C-108).
  const alwaysAsks = room.sensitive || room.isExternal
  return {
    failures,
    needsApproval: !refusedOutright && (alwaysAsks || failures.length > 0),
    refusedOutright,
  }
}

// The London day a booking belongs to, for grouping and for the calendar (0014).
export function londonDayOfBooking(at: Date): string {
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
