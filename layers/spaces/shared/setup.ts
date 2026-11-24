// What setting up room bookings starts from (spec part 6, "Purposes a preset creates"), shared by
// the server and the Purposes screen, which shows a list before it is made.
import type { OPEN_TO } from './states'

export const COLOURS = ['calendar-1', 'calendar-2', 'calendar-3', 'calendar-4', 'calendar-5', 'calendar-6', 'calendar-7', 'calendar-8'] as const

export const STARTING_LISTS = ['student-society', 'amateur-company', 'small-venue'] as const
export type StartingList = typeof STARTING_LISTS[number]

export interface StartingPurpose {
  slug: string
  name: string
  tier: number
  openTo: typeof OPEN_TO[number]
  needsProduction: boolean
  canBeBumped: boolean
  /** Approval in each list that makes it; a list that is absent does not make it. */
  approval: Partial<Record<StartingList, 'automatic' | 'approval'>>
}

export const STARTING_PURPOSES: readonly StartingPurpose[] = [
  { slug: 'maintenance', name: 'Maintenance and safety', tier: 1, openTo: 'staff', needsProduction: false, canBeBumped: false, approval: { 'student-society': 'automatic', 'amateur-company': 'automatic', 'small-venue': 'automatic' } },
  { slug: 'technical', name: 'Get-in, technical and dress', tier: 2, openTo: 'production-team', needsProduction: true, canBeBumped: true, approval: { 'student-society': 'approval', 'amateur-company': 'approval' } },
  { slug: 'rehearsal', name: 'Rehearsal', tier: 3, openTo: 'production-team', needsProduction: true, canBeBumped: true, approval: { 'student-society': 'approval', 'amateur-company': 'automatic' } },
  { slug: 'audition', name: 'Audition', tier: 3, openTo: 'production-team', needsProduction: true, canBeBumped: true, approval: { 'student-society': 'approval', 'amateur-company': 'automatic' } },
  { slug: 'workshop', name: 'Workshop or training', tier: 4, openTo: 'bookers', needsProduction: false, canBeBumped: true, approval: { 'student-society': 'approval', 'amateur-company': 'approval', 'small-venue': 'approval' } },
  { slug: 'meeting', name: 'Meeting', tier: 5, openTo: 'bookers', needsProduction: false, canBeBumped: true, approval: { 'student-society': 'approval', 'amateur-company': 'automatic', 'small-venue': 'automatic' } },
  { slug: 'social', name: 'Social', tier: 6, openTo: 'bookers', needsProduction: false, canBeBumped: true, approval: { 'student-society': 'approval' } },
  { slug: 'hire', name: 'Hire', tier: 4, openTo: 'staff', needsProduction: false, canBeBumped: true, approval: { 'small-venue': 'automatic' } },
]

export const startingPurposes = (list: StartingList) => STARTING_PURPOSES.flatMap(p => p.approval[list] ? [{ ...p, approval: p.approval[list] }] : [])

/** Minutes past midnight of an HH:MM clock reading; 24:00 is the end of the day. */
export const clockMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
