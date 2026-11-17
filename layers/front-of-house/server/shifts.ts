// Shifts and their window (part 3, "The shift window" and "Shifts"; FH-01). The window is stored on
// the shift: from a little before the call time to a little after the end. The two settings are
// read when a shift is made or its times change, so changing a setting moves no shift that exists.
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'

const MINUTE = 60_000 // not-policy: unit conversion

export interface Duty {
  id: string
  name: string
  description: string | null
  isLead: boolean
  callBeforeMinutes: number
  stayAfterMinutes: number
  requirements: string[]
  sortOrder: number
  archivedAt: number | null
}

interface DutyRow { id: string, name: string, description: string | null, is_lead: number, call_before_minutes: number, stay_after_minutes: number, requirements: string, sort_order: number, archived_at: number | null }

const toDuty = (r: DutyRow): Duty => ({
  id: r.id, name: r.name, description: r.description, isLead: !!r.is_lead, callBeforeMinutes: r.call_before_minutes,
  stayAfterMinutes: r.stay_after_minutes, requirements: JSON.parse(r.requirements) as string[], sortOrder: r.sort_order, archivedAt: r.archived_at,
})

export async function getDuty(id: string): Promise<Duty | null> {
  const row = await first<DutyRow>('SELECT * FROM front_of_house_duties WHERE id = ?', id)
  return row ? toDuty(row) : null
}

export async function listDuties(options: { includeArchived?: boolean } = {}): Promise<Duty[]> {
  const rows = await all<DutyRow>(`SELECT * FROM front_of_house_duties ${options.includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY sort_order, name`)
  return rows.map(toDuty)
}

export interface DutyInput {
  name: string
  description?: string | null
  isLead?: boolean
  callBeforeMinutes: number
  stayAfterMinutes: number
  requirements?: string[]
  sortOrder?: number
}

export function createDuty(unit: UnitView, input: DutyInput): string {
  const id = newId('dty')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_duties (id, name, description, is_lead, call_before_minutes, stay_after_minutes, requirements, sort_order, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM front_of_house_duties WHERE name = ? AND archived_at IS NULL)`,
    params: [id, input.name, input.description ?? null, input.isLead ? 1 : 0, input.callBeforeMinutes, input.stayAfterMinutes, JSON.stringify(input.requirements ?? []), input.sortOrder ?? 0, at, at, input.name],
  }).expect(1, { code: 'front-of-house.duty-name-taken', reason: 'There is already a duty with that name.', remedy: 'Choose another name, or edit the duty that exists.' })
  unit.audit({ action: 'create', detail: { duty: id } })
  return id
}

export interface ShiftTimes { callAt: number, endsAt: number, windowOpensAt: number, windowClosesAt: number, signUpClosesAt: number | null }

/**
 * The four times of a shift, and when sign-up closes. The call time is the performance's start less
 * the duty's call; the end is the performance's expected end plus the duty's stay; the window opens
 * window-before ahead of the call and closes window-after past the end.
 */
export async function shiftTimes(input: { callAt: number, endsAt: number, signUp: boolean }): Promise<ShiftTimes> {
  const before = await useSetting('front-of-house.shifts.window-before') as number
  const after = await useSetting('front-of-house.shifts.window-after') as number
  const closes = await useSetting('front-of-house.shifts.sign-up-closes') as number
  const second = 1000 // not-policy: settings are whole seconds
  return {
    callAt: input.callAt,
    endsAt: input.endsAt,
    windowOpensAt: input.callAt - before * second,
    windowClosesAt: input.endsAt + after * second,
    signUpClosesAt: input.signUp ? input.callAt - closes * second : null,
  }
}

export interface ShiftInput {
  dutyId: string
  places: number
  /** Overrides the duty's default call time for this shift. */
  callAt?: number
  endsAt?: number
  briefing?: string | null
  /** False when a manager fills the shift: no sign-up is offered. */
  signUp?: boolean
}

/** Adds one shift to a performance, as a draft. One shift per duty per performance. */
export async function addShift(unit: UnitView, performanceId: string, input: ShiftInput): Promise<string> {
  const performance = await getPerformance(performanceId)
  if (!performance) refuse('core.not-found', 'There is no such performance.', { status: 404 })
  if (performance.state === 'cancelled' || performance.state === 'completed')
    refuse('front-of-house.performance-over', 'This performance is cancelled or has taken place, so it takes no shifts.')
  const duty = await getDuty(input.dutyId)
  if (!duty || duty.archivedAt !== null) refuse('front-of-house.duty-archived', 'That duty is archived or does not exist.', { remedy: 'Choose another duty.' })
  const callAt = input.callAt ?? performance.startsAt - duty.callBeforeMinutes * MINUTE
  const endsAt = input.endsAt ?? performance.endsAt + duty.stayAfterMinutes * MINUTE
  if (endsAt <= callAt) refuse('front-of-house.shift-times', 'A shift must end after its call time.', { status: 422, fields: { endsAt: 'Must be after the call time.' } })
  const times = await shiftTimes({ callAt, endsAt, signUp: input.signUp ?? true })
  const id = newId('shf')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_shifts (id, performance_id, venue_id, duty_id, places, call_at, ends_at, window_opens_at, window_closes_at, sign_up_closes_at, briefing, state, created_at, updated_at)
      SELECT ?, ?, ?, d.id, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ? FROM front_of_house_duties d
       WHERE d.id = ? AND d.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM front_of_house_shifts s WHERE s.performance_id = ? AND s.duty_id = ?)`,
    params: [id, performanceId, performance.venueId, input.places, times.callAt, times.endsAt, times.windowOpensAt, times.windowClosesAt, times.signUpClosesAt, input.briefing ?? null, at, at, duty.id, performanceId, duty.id],
  }).expect(1, { code: 'front-of-house.shift-exists', reason: `This performance already has a ${duty.name} shift.`, remedy: 'Change the places on that shift instead.' })
  unit.audit({ action: 'create', record: ['front-of-house.shift', id] })
  return id
}

export interface Shift {
  id: string
  performanceId: string | null
  venueId: string | null
  title: string | null
  dutyId: string
  dutyName: string
  isLead: boolean
  places: number
  placesTaken: number
  callAt: number
  endsAt: number
  windowOpensAt: number
  windowClosesAt: number
  signUpClosesAt: number | null
  briefing: string | null
  state: 'draft' | 'published' | 'completed' | 'cancelled'
}

interface ShiftRow { id: string, performance_id: string | null, venue_id: string | null, title: string | null, duty_id: string, duty_name: string, is_lead: number, places: number, places_taken: number, call_at: number, ends_at: number, window_opens_at: number, window_closes_at: number, sign_up_closes_at: number | null, briefing: string | null, state: Shift['state'] }

const SHIFT = 'SELECT s.*, d.name AS duty_name, d.is_lead FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id'

const toShift = (r: ShiftRow): Shift => ({
  id: r.id, performanceId: r.performance_id, venueId: r.venue_id, title: r.title, dutyId: r.duty_id, dutyName: r.duty_name, isLead: !!r.is_lead,
  places: r.places, placesTaken: r.places_taken, callAt: r.call_at, endsAt: r.ends_at, windowOpensAt: r.window_opens_at, windowClosesAt: r.window_closes_at,
  signUpClosesAt: r.sign_up_closes_at, briefing: r.briefing, state: r.state,
})

export async function getShift(id: string): Promise<Shift | null> {
  const row = await first<ShiftRow>(`${SHIFT} WHERE s.id = ?`, id)
  return row ? toShift(row) : null
}

export async function shiftsOf(performanceId: string): Promise<Shift[]> {
  const rows = await all<ShiftRow>(`${SHIFT} WHERE s.performance_id = ? ORDER BY d.sort_order, d.name`, performanceId)
  return rows.map(toShift)
}

/**
 * The performance moved in time (part 3, rule 3): every shift keeps its offsets, the call and the
 * window's opening from the start, the end and the window's closing from the end. One statement for
 * the whole performance. Who is told comes with the notifications slice.
 */
export function moveShifts(unit: UnitView, input: { performanceId: string, startDelta: number, endDelta: number }): void {
  const s = input.startDelta
  const e = input.endDelta
  unit.add({
    // A performance cut shorter than a shift is long still leaves the shift a minute, so the CHECK holds.
    sql: `UPDATE front_of_house_shifts SET call_at = call_at + ?, window_opens_at = window_opens_at + ?,
        sign_up_closes_at = sign_up_closes_at + ?,
        ends_at = max(ends_at + ?, call_at + ? + ?),
        window_closes_at = window_closes_at + max(ends_at + ?, call_at + ? + ?) - ends_at, updated_at = ?
      WHERE performance_id = ? AND state IN ('draft', 'published')`,
    params: [s, s, s, e, s, MINUTE, e, s, MINUTE, nowMs(), input.performanceId],
  })
}
