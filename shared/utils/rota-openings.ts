import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import { londonDayField } from './membership'
import { showNightOf } from './show-night'
import { releaseRefusal } from './rota'
import type { ShiftStatus } from './rota'

// What a bar opening is, and what a slot on one is (E-130, 0077). A bar opening names no
// performance and no show, so nothing here reaches for either.

export const BAR_OPENING_STATUSES = ['PLANNED', 'CANCELLED'] as const
export type BarOpeningStatus = (typeof BAR_OPENING_STATUSES)[number]

// A label stands in for a show title on the rota, so it says what the evening is.
export const BAR_OPENING_LABEL_LIMIT = 120

// Shorter than a day, so a closing time typed the same as the opening time is refused (0215).
export const MAX_BAR_OPENING_SECONDS = 86_400
export const SAME_TIME_REFUSAL = 'The bar closes at the time it opens. Give a closing time after the opening time'
export const DAY_LONG_REFUSAL = 'A bar opening lasts less than a day. Give a closing time within a day of the opening time'

// What an officer is told before planning a second opening over one already at the venue (0215).
export function openingOverlapWarning(other: { label: string, opens: string, closes: string }, venueName: string): string {
  return `${other.label} is already planned at ${venueName} from ${other.opens} to ${other.closes}, and this overlaps it. Plan the opening anyway, or change the times.`
}

// Removing the only slot is refused on the write, so the button says why rather than offering it (0215).
export const ONLY_SLOT_HINT = 'The only slot: cancel the opening instead'

export const barOpeningForm = z.object({
  venueId: z.string().min(1, 'Say which venue is opening').max(64),
  night: londonDayField,
  label: z.string().trim().min(1, 'Name the opening: it stands in for a show title on the rota').max(BAR_OPENING_LABEL_LIMIT),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  // Set when the officer has been told it overlaps another opening at the venue and goes ahead (0215).
  overlapping: z.boolean().optional(),
}).refine(input => input.endsAt > input.startsAt, {
  message: 'A bar opening closes after it opens',
  path: ['endsAt'],
// Equal times on the form read as a whole day; nobody plans a 24-hour bar on purpose (0215).
}).refine(input => input.endsAt - input.startsAt < MAX_BAR_OPENING_SECONDS, {
  message: DAY_LONG_REFUSAL,
  path: ['endsAt'],
// The night is what the list filters and what authority resolves against, so one disagreeing
// with the opening's own clock would file under one night and let people in on another (0014).
}).refine(input => showNightOf(new Date(input.startsAt * 1000)) === input.night, {
  message: 'That opening time falls on a different show night',
  path: ['night'],
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

// Why a holder's own release did not apply, read only to explain it: the cut-off rides the write
// (E-107 criterion 1), and an officer may reassign the slot between the read and the write.
export function openingReleaseRefusal(now: { userId: string | null, status: ShiftStatus } | null, callerId: string, heldStatus: ShiftStatus): string {
  if (now && (now.status === 'CLAIMED' || now.status === 'CONFIRMED')) {
    return now.userId === callerId
      ? 'That night has already begun, so the slot can no longer be released'
      : 'This slot has been reassigned since you opened this page'
  }
  return releaseRefusal(now?.status ?? heldStatus)
}

// Standing a slot down accepts anything with a name on it, a declined claim included, so only
// the two statuses that name nobody are refused.
export function openingUnconfirmRefusal(status: ShiftStatus): string {
  if (status === 'CANCELLED') return 'This slot has been cancelled'
  return 'This slot is already open'
}

// Why removing a slot did not apply. Read only to explain a refusal: the predicate rides the
// delete (E-130 criterion 7, 0003).
export function openingSlotRemoveRefusal(
  slot: { status: ShiftStatus, openingStatus: BarOpeningStatus } | null,
  remaining: number,
): string {
  if (!slot) return 'That slot has already been removed'
  if (slot.openingStatus === 'CANCELLED' || slot.status === 'CANCELLED') return 'This opening has been cancelled'
  if (slot.status !== 'OPEN') return 'Somebody holds that slot: stand them down first, then remove it'
  if (remaining <= 1) return 'That is the only slot on this opening: cancel the opening instead'
  return 'That slot cannot be removed'
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
