import { londonParts } from './london'

// A membership is a term bought at the SU, not a committee year (0031). Everything about "is this
// person a member" is a question about dates, which is why it lives here rather than in a query.

export const MEMBERSHIP_TERMS = [1, 3] as const
export type MembershipTerm = (typeof MEMBERSHIP_TERMS)[number]

// The London calendar day an instant falls on, as the string the columns hold.
export function londonDay(at: Date): string {
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// The last day a term covers: a year from the fourteenth is the thirteenth, not the fourteenth.
export function endOfTerm(startsOn: string, years: MembershipTerm): string {
  const [year, month, day] = startsOn.split('-').map(Number) as [number, number, number]
  const end = new Date(Date.UTC(year + years, month - 1, day))
  end.setUTCDate(end.getUTCDate() - 1)
  return londonDay(end)
}

// A day plus a number of days, for the grace window a lapsed membership still counts inside.
export function daysAfter(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return londonDay(new Date(Date.UTC(year, month - 1, date + days)))
}

export interface Term { startsOn: string, expiresOn: string }

// Current means today is inside the term, or inside the grace window after it. Read at query time
// like a role grant, so a membership that ran out overnight stops counting without a sweep (0009).
export function isCurrent(term: Term, today: string, graceDays: number): boolean {
  return today >= term.startsOn && today <= daysAfter(term.expiresOn, graceDays)
}

// Inside the term proper. The grace window is a courtesy, not a membership.
export function isInGrace(term: Term, today: string, graceDays: number): boolean {
  return today > term.expiresOn && isCurrent(term, today, graceDays)
}
