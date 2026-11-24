// Managing the rota (part 3, "Shifts"; FH-05 to FH-08, FH-16): editing duties, publishing and
// withdrawing shifts, shifts not tied to a performance, changing places and times, cancelling, and
// following the performance when the core moves or cancels it. A write that reaches many people is
// set-wise; nobody is told twice about one change.
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { getPerformance, holdersOf, notify, placeName } from '#modules/core'
import { LIVE_STATES } from './db/schema'
import { getShift, shiftTimes, type DutyInput, type Shift } from './shifts'
import { getCrewCall } from './crew-calls'
import { formatter, partFormatters, shiftDetails, shiftWords } from './words'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

// ---------------------------------------------------------------------------------------------
// Duties

export function updateDuty(unit: UnitView, id: string, input: DutyInput): void {
  unit.add({
    sql: `UPDATE front_of_house_duties SET name = ?, description = ?, is_lead = ?, call_before_minutes = ?, stay_after_minutes = ?, requirements = ?, sort_order = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM front_of_house_duties WHERE name = ? AND archived_at IS NULL AND id <> ?)`,
    params: [input.name, input.description ?? null, input.isLead ? 1 : 0, input.callBeforeMinutes, input.stayAfterMinutes, JSON.stringify(input.requirements ?? []), input.sortOrder ?? 0, nowMs(), id, input.name, id],
  }).expect(1, { code: 'front-of-house.duty-name-taken', reason: 'There is already a duty with that name, or this one is archived.' })
  unit.audit({ action: 'update', detail: { duty: id } })
}

/** An archived duty takes no new shifts; shifts it already has carry on. */
export function archiveDuty(unit: UnitView, id: string): void {
  const at = nowMs()
  unit.add({ sql: 'UPDATE front_of_house_duties SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL', params: [at, at, id] })
    .expect(1, { code: 'front-of-house.duty-archived', reason: 'This duty is already archived.' })
  unit.audit({ action: 'update', detail: { duty: id, archived: true } })
}

/** Brings an archived duty back with everything it had. Refused while a live duty holds its name. */
export async function restoreDuty(unit: UnitView, id: string): Promise<void> {
  const row = await first<{ archived_at: number | null }>('SELECT archived_at FROM front_of_house_duties WHERE id = ?', id)
  if (!row) refuse('core.not-found', 'There is no such duty.', { status: 404 })
  const refusal = row.archived_at === null
    ? { code: 'front-of-house.duty-not-archived', reason: 'This duty is not archived.' }
    : { code: 'front-of-house.duty-name-taken', reason: 'There is already a duty with that name.', remedy: 'Rename the other duty, then restore this one.' }
  unit.add({
    sql: `UPDATE front_of_house_duties SET archived_at = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM front_of_house_duties o WHERE o.name = front_of_house_duties.name AND o.archived_at IS NULL)`,
    params: [nowMs(), id],
  }).expect(1, refusal)
  unit.audit({ action: 'update', detail: { duty: id, restored: true } })
}

// ---------------------------------------------------------------------------------------------
// Shifts not tied to a performance (FH-08): a get-in, a social, a bar opening. They confer rostered only.

export interface OccasionInput { title: string, venueId?: string | null, dutyId: string, places: number, callAt: number, endsAt: number, briefing?: string | null, signUp?: boolean, crewCallId?: string | null }

export async function addOccasionShift(unit: UnitView, input: OccasionInput): Promise<string> {
  const call = input.crewCallId ? await getCrewCall(input.crewCallId) : null
  if (input.crewCallId && (!call || call.state === 'archived'))
    refuse('front-of-house.crew-call.archived', 'That crew call is archived or does not exist.', { status: 422, fields: { crewCallId: 'Choose another crew call.' } }) // not-policy: HTTP status
  if (input.endsAt <= input.callAt) refuse('front-of-house.shift-times', 'A shift must end after its call time.', { status: 422, fields: { endsAt: 'Must be after the call time.' } })
  const times = await shiftTimes({ callAt: input.callAt, endsAt: input.endsAt, signUp: input.signUp ?? true })
  const id = newId('shf')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_shifts (id, title, venue_id, duty_id, places, call_at, ends_at, window_opens_at, window_closes_at, sign_up_closes_at, briefing, state, crew_call_id, created_at, updated_at)
      SELECT ?, ?, ?, d.id, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ? FROM front_of_house_duties d WHERE d.id = ? AND d.archived_at IS NULL`,
    params: [id, input.title, input.venueId ?? null, input.places, times.callAt, times.endsAt, times.windowOpensAt, times.windowClosesAt, times.signUpClosesAt, input.briefing ?? null, input.crewCallId ?? null, at, at, input.dutyId],
  }).expect(1, { code: 'front-of-house.duty-archived', reason: 'That duty is archived or does not exist.', remedy: 'Choose another duty.' })

  unit.audit({ action: 'create', record: ['front-of-house.shift', id] })
  return id
}

// ---------------------------------------------------------------------------------------------
// Publishing (FH-07)

/**
 * Publishes draft shifts together, so members can see them. Every one named must be a draft.
 * Volunteers are sent one message for the whole publish, listing the shifts that have a place free.
 */
export async function publishShifts(unit: UnitView, shifts: Shift[]): Promise<void> {
  if (!shifts.length) return
  unit.add({
    sql: 'UPDATE front_of_house_shifts SET state = \'published\', updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND state = \'draft\'',
    params: [nowMs(), JSON.stringify(shifts.map(s => s.id))],
  }).expect(shifts.length, { code: 'front-of-house.shift-not-draft', reason: 'Only draft shifts can be published, and one of these is not a draft any more.' })
  unit.announce('front-of-house.shift.published', shifts.map(s => ({ payload: { shiftId: s.id, performanceId: s.performanceId }, record: ['front-of-house.shift', s.id] as const })))
  unit.audit(shifts.map(s => ({ action: 'update', record: ['front-of-house.shift', s.id] as const, detail: { state: 'published' } })))
  await tellVolunteers(unit, shifts)
}

/** One digest to everyone who can sign up, listing what is open: a performance's shifts on one line. */
async function tellVolunteers(unit: UnitView, shifts: Shift[]): Promise<void> {
  const open = shifts.filter(s => s.signUpClosesAt !== null && s.places > s.placesTaken)
  if (!open.length) return
  const { date } = await partFormatters()
  const groups = new Map<string, Shift[]>()
  for (const s of open) groups.set(s.performanceId ?? s.id, [...groups.get(s.performanceId ?? s.id) ?? [], s])
  const lines: string[] = []
  for (const group of [...groups.values()].sort((a, b) => a[0]!.callAt - b[0]!.callAt)) {
    const words = await shiftWords(group[0]!)
    const duties = group.map(s => (s.places - s.placesTaken > 1 ? `${s.dutyName} (${s.places - s.placesTaken} places)` : s.dutyName)).join(', ')
    lines.push(`• ${words.show}, ${date(group[0]!.callAt)}: ${duties}`)
  }
  const people = await holdersOf('front-of-house.shift.sign-up')
  if (!people.length) return
  const variables = { count: lines.length === 1 ? 'one performance' : `${lines.length} performances`, shifts: lines.join('\n') }
  const key = `published:${open.map(s => s.id).sort().join(',')}`
  // A set is bounded, so a large membership is told in turns.
  const turn = await useSetting('core.units.set-rows-limit') as number
  for (let i = 0; i < people.length; i += turn)
    await notify(unit, 'front-of-house.rota-published', { to: people.slice(i, i + turn), variables, dedupeKey: key })
}

/** Takes a published shift back to draft, only while nobody is on it. */
export function unpublishShift(unit: UnitView, shift: Shift): void {
  unit.add({
    sql: `UPDATE front_of_house_shifts SET state = 'draft', updated_at = ? WHERE id = ? AND state = 'published' AND places_taken = 0
      AND NOT EXISTS (SELECT 1 FROM front_of_house_assignments WHERE shift_id = ? AND state IN (${live}))`,
    params: [nowMs(), shift.id, shift.id],
  }).expect(1, { code: 'front-of-house.shift-has-people', reason: 'Someone is on this shift, so it cannot go back to draft.', remedy: 'Cancel it instead, which tells them.' })
  unit.audit({ action: 'update', record: ['front-of-house.shift', shift.id], detail: { state: 'draft' } })
}

// ---------------------------------------------------------------------------------------------
// Changing a shift

export interface ShiftPatch { places?: number, callAt?: number, endsAt?: number, briefing?: string | null, signUp?: boolean }

/**
 * Changes places, times or the briefing. Places never go below the places taken. New times take the
 * window settings as they are now (part 3, rule 1). People on the shift are told of a new time.
 */
export async function updateShift(unit: UnitView, shift: Shift, patch: ShiftPatch): Promise<void> {
  if (shift.state === 'cancelled' || shift.state === 'completed') refuse('front-of-house.shift-over', 'This shift is cancelled or finished, so it cannot change.')
  const at = nowMs()
  if (patch.places !== undefined) {
    unit.add({ sql: 'UPDATE front_of_house_shifts SET places = ?, updated_at = ? WHERE id = ? AND places_taken <= ?', params: [patch.places, at, shift.id, patch.places] })
      .expect(1, { code: 'front-of-house.places-below-taken', reason: 'More people are on this shift than that.', remedy: 'Remove someone first, or keep more places.' })
  }
  const retimed = patch.callAt !== undefined || patch.endsAt !== undefined || patch.signUp !== undefined
  if (retimed) {
    const callAt = patch.callAt ?? shift.callAt
    const endsAt = patch.endsAt ?? shift.endsAt
    if (endsAt <= callAt) refuse('front-of-house.shift-times', 'A shift must end after its call time.', { status: 422, fields: { endsAt: 'Must be after the call time.' } })
    const times = await shiftTimes({ callAt, endsAt, signUp: patch.signUp ?? shift.signUpClosesAt !== null })
    // Never close a window earlier than an "Extend tonight" left it, unless the end itself moved earlier.
    unit.add({
      sql: 'UPDATE front_of_house_shifts SET call_at = ?, ends_at = ?, window_opens_at = ?, window_closes_at = ?, sign_up_closes_at = ?, updated_at = ? WHERE id = ? AND state IN (\'draft\', \'published\')',
      params: [times.callAt, times.endsAt, times.windowOpensAt, times.windowClosesAt, times.signUpClosesAt, at, shift.id],
    }).expect(1, { code: 'front-of-house.shift-over', reason: 'This shift has just been cancelled or finished.' })
  }
  if (patch.briefing !== undefined) unit.add({ sql: 'UPDATE front_of_house_shifts SET briefing = ?, updated_at = ? WHERE id = ?', params: [patch.briefing, at, shift.id] })
  unit.audit({ action: 'update', record: ['front-of-house.shift', shift.id], detail: { places: patch.places ?? null, retimed } })
  if (retimed && (patch.callAt ?? shift.callAt) !== shift.callAt) {
    const people = await peopleOn([shift.id])
    if (people.length) {
      const moved = { ...shift, callAt: patch.callAt ?? shift.callAt, endsAt: patch.endsAt ?? shift.endsAt, briefing: patch.briefing !== undefined ? patch.briefing : shift.briefing }
      markMoved(unit, [shift.id], at)
      await notify(unit, 'front-of-house.shift-changed', { to: people.map(p => p.accountId), variables: { ...await shiftWords(moved), details: await shiftDetails(moved) }, subject: ['front-of-house.shift', shift.id] })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cancelling

/** Those on these shifts may now give their place up at any time: the shift is not the one they took. */
function markMoved(unit: UnitView, shiftIds: string[], at: number): void {
  unit.add({
    sql: `UPDATE front_of_house_assignments SET moved_at = ?, updated_at = ? WHERE shift_id IN (SELECT value FROM json_each(?)) AND state IN (${live})`,
    params: [at, at, JSON.stringify(shiftIds)],
  })
}

interface Person { assignmentId: string, shiftId: string, accountId: string }

/** Everyone with a live assignment on these shifts. */
async function peopleOn(shiftIds: string[]): Promise<Person[]> {
  const rows = await all<{ id: string, shift_id: string, account_id: string }>(
    `SELECT id, shift_id, account_id FROM front_of_house_assignments WHERE shift_id IN (SELECT value FROM json_each(?)) AND state IN (${live}) ORDER BY id`,
    JSON.stringify(shiftIds))
  return rows.map(r => ({ assignmentId: r.id, shiftId: r.shift_id, accountId: r.account_id }))
}

/**
 * Cancels shifts and releases everyone on them, in one batch. Each person is told once, however
 * many of the shifts they were on. `by` is null when the core's event did it.
 */
async function cancel(unit: UnitView, shifts: Shift[], input: { reason: string | null, by: string | null }): Promise<void> {
  if (!shifts.length) return
  const ids = shifts.map(s => s.id)
  const people = await peopleOn(ids)
  const at = nowMs()
  unit.add({
    sql: `UPDATE front_of_house_assignments SET state = 'released', ended_at = ?, ended_by = ?, updated_at = ?
      WHERE shift_id IN (SELECT value FROM json_each(?)) AND state IN (${live})`,
    params: [at, input.by, at, JSON.stringify(ids)],
  })
  unit.add({
    sql: 'UPDATE front_of_house_shifts SET state = \'cancelled\', cancelled_reason = ?, places_taken = 0, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND state IN (\'draft\', \'published\')',
    params: [input.reason, at, JSON.stringify(ids)],
  }).expect(ids.length, { code: 'front-of-house.shift-over', reason: 'This shift is already cancelled or finished.' })
  unit.announce('front-of-house.shift.cancelled', shifts.map(s => ({ payload: { shiftId: s.id, performanceId: s.performanceId }, record: ['front-of-house.shift', s.id] as const })))
  if (people.length) {
    unit.announce('front-of-house.assignment.released', people.map(p => ({ payload: { assignmentId: p.assignmentId, shiftId: p.shiftId, accountId: p.accountId }, record: ['front-of-house.assignment', p.assignmentId] as const })))
    // Each person is given the call time of their own shift, which differs between duties; once, by their earliest.
    const earliest = new Map<string, Shift>()
    for (const p of people) {
      const shift = shifts.find(s => s.id === p.shiftId)!
      const held = earliest.get(p.accountId)
      if (!held || shift.callAt < held.callAt) earliest.set(p.accountId, shift)
    }
    const key = shifts[0]!.performanceId ?? shifts[0]!.id
    const said = new Map<string, Awaited<ReturnType<typeof shiftWords>>>()
    for (const shift of earliest.values()) if (!said.has(shift.id)) said.set(shift.id, await shiftWords(shift))
    const to = [...earliest].map(([accountId, shift]) => {
      const words = said.get(shift.id)!
      return { accountId, variables: { show: words.show, when: words.when, date: words.date } }
    })
    await notify(unit, 'front-of-house.shift-cancelled', { to, dedupeKey: `cancel:${key}` })
  }
  unit.audit(shifts.map(s => ({ action: 'update', record: ['front-of-house.shift', s.id] as const, detail: { state: 'cancelled', released: people.filter(p => p.shiftId === s.id).length } })))
}

/** A manager cancels one shift, with a reason. */
export async function cancelShift(unit: UnitView, shift: Shift, input: { reason: string, by: string }): Promise<void> {
  if (shift.state === 'cancelled' || shift.state === 'completed') refuse('front-of-house.shift-over', 'This shift is already cancelled or finished.')
  await cancel(unit, [shift], input)
}

async function liveShiftsOf(performanceId: string): Promise<Shift[]> {
  const rows = await all<{ id: string }>('SELECT id FROM front_of_house_shifts WHERE performance_id = ? AND state IN (\'draft\', \'published\')', performanceId)
  return (await Promise.all(rows.map(r => getShift(r.id)))).filter((s): s is Shift => !!s)
}

// ---------------------------------------------------------------------------------------------
// Following the performance (part 4, "Events front of house listens to")

/** core.performance.cancelled: every shift is cancelled and everyone on one is told, once. */
export async function performanceCancelled(unit: UnitView, performanceId: string): Promise<void> {
  await cancel(unit, await liveShiftsOf(performanceId), { reason: null, by: null })
}

/** core.performance.moved: the shifts take the new venue; people are told the new place. */
export async function performanceMoved(unit: UnitView, performanceId: string, eventId: string): Promise<void> {
  const performance = await getPerformance(performanceId)
  unit.add({ sql: 'UPDATE front_of_house_shifts SET venue_id = ?, updated_at = ? WHERE performance_id = ? AND state IN (\'draft\', \'published\')', params: [performance.venueId, nowMs(), performanceId] })
  await tellPeople(unit, await liveShiftsOf(performanceId), await placeName(performance.spaceId) ?? performance.venueName, eventId)
}

/** core.performance.rescheduled: tell everyone on a shift of the performance its new call time. */
export async function performanceRescheduled(unit: UnitView, performanceId: string, offsets: { startDelta: number, endDelta: number }, eventId: string): Promise<void> {
  const shifts = (await liveShiftsOf(performanceId)).map(s => ({ ...s, callAt: s.callAt + offsets.startDelta, endsAt: Math.max(s.endsAt + offsets.endDelta, s.callAt + offsets.startDelta + 60_000) })) // not-policy: a shift keeps a minute at least
  await tellPeople(unit, shifts, null, eventId)
}

async function tellPeople(unit: UnitView, shifts: Shift[], where: string | null, eventId: string): Promise<void> {
  const people = await peopleOn(shifts.map(s => s.id))
  if (!people.length) return
  const format = await formatter()
  const { date } = await partFormatters()
  const show = (await shiftWords(shifts[0]!)).show
  const byShift = new Map(shifts.map(s => [s.id, s]))
  // Whoever is on a shift whose time or place changed may give it up without notice.
  markMoved(unit, shifts.map(s => s.id), nowMs())
  const details = new Map<string, string>()
  const seen = new Set<string>()
  const to = []
  for (const p of people.filter(p => !seen.has(p.accountId) && seen.add(p.accountId))) {
    const shift = byShift.get(p.shiftId)!
    if (!details.has(shift.id)) details.set(shift.id, await shiftDetails(shift))
    to.push({ accountId: p.accountId, variables: { duty: shift.dutyName, show, when: format(shift.callAt), date: date(shift.callAt), details: details.get(shift.id)!, ...(where ? { where } : {}) } })
  }
  // The event's id keeps a retried listener from telling anyone twice.
  await notify(unit, where ? 'front-of-house.shift-moved' : 'front-of-house.shift-changed', { to, dedupeKey: `change:${eventId}` })
}
