import { z } from 'zod'
import { NIGHT_ROLES } from './night-authority'
import type { NightRole } from './night-authority'

// The rota's vocabulary: what a venue's template holds, and what a stamped shift is (E-101,
// E-102, E-106). Nothing here reads a request or the database.

// A shift's role is a night role: the rota is what the night's authority derives from, so a
// second vocabulary here would be a second answer to the same question (0044, E-111).
export const SHIFT_ROLES = NIGHT_ROLES
export type ShiftRole = NightRole

export const SHIFT_STATUSES = ['OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED', 'CANCELLED'] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

// The statuses that name a person. The CHECK on `shifts` says the same thing in SQL, and
// `tests/unit/rota.test.ts` fails when the two stop agreeing (E-106 criterion 2).
export const ASSIGNED_SHIFT_STATUSES: readonly ShiftStatus[] = ['CLAIMED', 'CONFIRMED', 'DECLINED']

// A person is committed to a shift once it is claimed or confirmed; a decline keeps their name on
// the record but takes them off it, so a cancellation or a venue move leaves it alone (E-102).
export const COMMITTED_SHIFT_STATUSES: readonly ShiftStatus[] = ['CLAIMED', 'CONFIRMED']

// A cancelled shift keeps whoever held it, and holds nobody when it was open, so it is the one
// status that says nothing about the person column.
export function shiftNamesAPerson(status: ShiftStatus): boolean | null {
  if (status === 'OPEN') return false
  if (status === 'CANCELLED') return null
  return true
}

// A house needs one duty manager, some door staff and a bar; more than this is a data entry
// slip, and the count is what a person types.
export const MAX_SLOT_COUNT = 20

export interface TemplateSlot {
  role: ShiftRole
  count: number
}

// One row per role, which is the whole template for a venue. A venue with no rows has no
// template, and its performances stamp nothing (E-101 criterion 4).
export const templateSlotForm = z.object({
  role: z.enum(SHIFT_ROLES),
  count: z.number().int().min(1).max(MAX_SLOT_COUNT),
})

export const shiftTemplateForm = z.object({
  slots: z.array(templateSlotForm).max(SHIFT_ROLES.length),
})

export type ShiftTemplateInput = z.output<typeof shiftTemplateForm>

// Every venue template carries exactly one duty manager (E-101 criterion 1). The count is a
// CHECK on the row; that the slot is there at all correlates rows, so it is refused here.
export function templateRefusal(slots: TemplateSlot[]): string | null {
  const roles = slots.map(slot => slot.role)
  if (new Set(roles).size !== roles.length) return 'A template names each role once'

  const dutyManager = slots.find(slot => slot.role === 'DUTY_MANAGER')
  if (!dutyManager) return 'A venue template needs one duty manager slot: the night cannot legally run without one'
  if (dutyManager.count !== 1) return 'A venue template holds exactly one duty manager slot'

  return null
}

export interface StampedSlot {
  role: ShiftRole
  slot: number
}

// A slot's identity within a performance: its role and its ordinal in that role, counting from
// one. It is what makes a second stamping a no-op rather than a duplicate (E-102 criterion 2).
export function stampedSlots(slots: TemplateSlot[]): StampedSlot[] {
  return slots.flatMap(slot =>
    Array.from({ length: slot.count }, (_, index) => ({ role: slot.role, slot: index + 1 })))
}

// A fixed order, so a template reads the same on every screen whatever order it was saved in.
export function orderedSlots<T extends { role: ShiftRole }>(slots: T[]): T[] {
  return [...slots].sort((a, b) => SHIFT_ROLES.indexOf(a.role) - SHIFT_ROLES.indexOf(b.role))
}

export function saysShiftRole(role: ShiftRole): string {
  if (role === 'DUTY_MANAGER') return 'Duty manager'
  if (role === 'DOOR') return 'Door'
  return 'Bar'
}

export function saysShiftStatus(status: ShiftStatus): string {
  if (status === 'OPEN') return 'Open'
  if (status === 'CLAIMED') return 'Claimed'
  if (status === 'CONFIRMED') return 'Confirmed'
  if (status === 'DECLINED') return 'Declined'
  return 'Cancelled'
}

// What a refused write reads as. SQLite names the columns for a unique index and the constraint
// name for a CHECK, so both spellings appear here (E-106 criterion 3).
export const SHIFT_CONSTRAINT_REFUSALS: { violated: string, says: string }[] = [
  {
    violated: 'shifts.performance_id',
    says: 'This performance already has a confirmed duty manager',
  },
  {
    violated: 'shifts.performance_id, shifts.role, shifts.slot',
    says: 'That slot on this performance is already on the rota',
  },
  {
    violated: 'shifts_open_names_nobody',
    says: 'An open shift names nobody, and a claimed, confirmed or declined one names somebody',
  },
  {
    violated: 'shift_templates.venue_id, shift_templates.role',
    says: 'A template names each role once',
  },
  {
    violated: 'shift_templates_one_duty_manager',
    says: 'A venue template holds exactly one duty manager slot',
  },
]

// Stops at the colon a wrapped error appends, so the same message is matched whether it came
// back from SQLite directly or through D1.
const VIOLATED = /constraint failed:\s*([a-z0-9_. ,]+)/i

// A raw constraint failure is never what a caller reads back. Anything unrecognised returns null
// and is rethrown by the caller, because a 409 would hide a defect nobody then investigates.
export function shiftConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  const said = error instanceof Error ? error.message : String(error)
  const violated = VIOLATED.exec(said)?.[1]?.trim()
  const matched = SHIFT_CONSTRAINT_REFUSALS.find(refusal => refusal.violated === violated)
  return matched ? { statusCode: 409, statusMessage: matched.says } : null
}
