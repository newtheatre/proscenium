import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import { londonDayField } from './membership'
import type { ShiftStatus } from './rota'

// What a bar opening is, and what a slot on one is (E-130, 0077). A bar opening names no
// performance and no show, so nothing here reaches for either.

export const BAR_OPENING_STATUSES = ['PLANNED', 'CANCELLED'] as const
export type BarOpeningStatus = (typeof BAR_OPENING_STATUSES)[number]

// A label stands in for a show title on the rota, so it says what the evening is.
export const BAR_OPENING_LABEL_LIMIT = 120

export const barOpeningForm = z.object({
  venueId: z.string().min(1, 'Say which venue is opening').max(64),
  night: londonDayField,
  label: z.string().trim().min(1, 'Name the opening: it stands in for a show title on the rota').max(BAR_OPENING_LABEL_LIMIT),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
}).refine(input => input.endsAt > input.startsAt, {
  message: 'A bar opening closes after it opens',
  path: ['endsAt'],
})

export type BarOpeningInput = z.output<typeof barOpeningForm>

export function saysBarOpeningStatus(status: BarOpeningStatus): string {
  return status === 'PLANNED' ? 'Planned' : 'Cancelled'
}

// A venue that has never been asked how many people its bar needs stamps nothing rather than
// guessing one slot (E-130 criterion 2).
export function noBarSlotsRefusal(venueName: string): string {
  return `${venueName} has no bar row in its shift template, so there is nothing to stamp. Set the template up first.`
}

// Why a claim did not apply. The predicate rides the write, so this is read only to explain a
// refusal, never to decide one (E-104, E-130 criterion 3).
export function openingClaimRefusal(status: ShiftStatus): string {
  if (status !== 'OPEN') return 'That slot has already been taken'
  return 'You already hold a slot on this opening'
}

// Why an officer's assignment did not apply: cancelled, or the member already committed to
// another slot on the same opening (E-107 criterion 3).
export function openingReassignRefusal(status: ShiftStatus): string {
  if (status === 'CANCELLED') return 'This slot has been cancelled'
  return 'That member already holds a slot on this opening'
}

// Standing a slot down accepts a claimed or a confirmed one, so anything else names what it is.
export function openingUnconfirmRefusal(status: ShiftStatus): string {
  if (status === 'CANCELLED') return 'This slot has been cancelled'
  if (status === 'OPEN') return 'This slot is already open'
  return 'Only a claimed or confirmed slot can be stood down'
}

export function openingCancelRefusal(status: BarOpeningStatus): string {
  return status === 'CANCELLED' ? 'This opening has already been cancelled' : 'This opening cannot be cancelled'
}

// What a refused write reads as: SQLite names the columns for a unique index and the constraint
// name for a CHECK, so both spellings appear here (E-106 criterion 3, 0047).
export const BAR_OPENING_CONSTRAINT_REFUSALS: { violated: string, says: string }[] = [
  {
    violated: 'bar_openings_ends_after_start',
    says: 'A bar opening closes after it opens',
  },
  {
    violated: 'bar_opening_shifts.opening_id, bar_opening_shifts.slot',
    says: 'That slot on this opening is already on the rota',
  },
  {
    violated: 'bar_opening_shifts_open_names_nobody',
    says: 'An open slot names nobody, and a claimed, confirmed or declined one names somebody',
  },
]

export function barOpeningConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(BAR_OPENING_CONSTRAINT_REFUSALS, error)
}
