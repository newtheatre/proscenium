// What happens to an assignment after sign-up (part 3, "Assignments"; FH-11 to FH-14): a manager
// confirms, declines, assigns or removes; the person withdraws, releases or keeps; another member
// takes cover. Every move is guarded on the state it starts from, and every place freed or taken
// changes places_taken in the same batch.
import { first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { holdersOf, notify } from '#modules/core'
import { LIVE_STATES } from './db/schema'
import { confirmed, eligibility, type Eligibility } from './assignments'
import { getShift, type Shift } from './shifts'
import { questionsWaiting, requireAnswered } from './crew-calls'
import { shiftWords } from './words'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

export interface Assignment { id: string, shiftId: string, accountId: string, state: string, source: string, movedAt: number | null }

export async function getAssignment(id: string): Promise<Assignment | null> {
  const row = await first<{ id: string, shift_id: string, account_id: string, state: string, source: string, moved_at: number | null }>('SELECT id, shift_id, account_id, state, source, moved_at FROM front_of_house_assignments WHERE id = ?', id)
  return row ? { id: row.id, shiftId: row.shift_id, accountId: row.account_id, state: row.state, source: row.source, movedAt: row.moved_at } : null
}

async function load(id: string): Promise<{ assignment: Assignment, shift: Shift }> {
  const assignment = await getAssignment(id)
  const shift = assignment && await getShift(assignment.shiftId)
  if (!assignment || !shift) refuse('core.not-found', 'There is no such place on a shift.', { status: 404 })
  return { assignment, shift }
}

/** Is this assignment the actor's own? Through the account scope, so a merged person is still themselves. */
async function own(assignmentId: string, accountId: string): Promise<boolean> {
  return !!await first(`SELECT 1 AS one FROM front_of_house_assignments WHERE id = ?2 AND account_id IN (${accountScopeSql('?1')})`, accountId, assignmentId)
}

function released(unit: UnitView, a: Assignment): void {
  unit.announce('front-of-house.assignment.released', { assignmentId: a.id, shiftId: a.shiftId, accountId: a.accountId }, { record: ['front-of-house.assignment', a.id] })
}

/**
 * Moves one assignment from one of `from` to `to`, ending it when `to` is final, and frees its
 * place when `free`. The guard is the state it starts from.
 */
function move(unit: UnitView, a: Assignment, input: { from: string[], to: string, by: string | null, free: boolean, reason?: string | null, refusal: { code: string, reason: string } }): void {
  const at = nowMs()
  const ends = !(LIVE_STATES as readonly string[]).includes(input.to)
  unit.add({
    sql: `UPDATE front_of_house_assignments SET state = ?, updated_at = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN coalesce(confirmed_at, ?) ELSE confirmed_at END,
        ended_at = CASE WHEN ? THEN ? ELSE NULL END, ended_by = CASE WHEN ? THEN ? ELSE NULL END, release_reason = coalesce(?, release_reason)
      WHERE id = ? AND state IN (SELECT value FROM json_each(?))`,
    params: [input.to, at, input.to, at, ends ? 1 : 0, at, ends ? 1 : 0, input.by, input.reason ?? null, a.id, JSON.stringify(input.from)],
  }).expect(1, input.refusal)
  if (input.free) unit.add({ sql: 'UPDATE front_of_house_shifts SET places_taken = places_taken - 1, updated_at = ? WHERE id = ?', params: [at, a.shiftId] })
  unit.audit({ action: 'state', record: ['front-of-house.assignment', a.id], detail: { from: a.state, to: input.to } })
}

const MOVED_ON = { code: 'front-of-house.assignment-moved-on', reason: 'This place has changed since you opened it.' }

// ---------------------------------------------------------------------------------------------
// A manager (FH-11, FH-12)

export async function confirmRequest(unit: UnitView, id: string, by: string): Promise<void> {
  const { assignment, shift } = await load(id)
  move(unit, assignment, { from: ['requested'], to: 'confirmed', by, free: false, refusal: { code: 'front-of-house.not-requested', reason: 'Only a request can be confirmed.' } })
  await confirmed(unit, { assignmentId: id, shift, accountId: assignment.accountId })
}

export async function declineRequest(unit: UnitView, id: string, by: string): Promise<void> {
  const { assignment } = await load(id)
  move(unit, assignment, { from: ['requested'], to: 'declined', by, free: true, refusal: { code: 'front-of-house.not-requested', reason: 'Only a request can be declined.' } })
  released(unit, assignment)
}

/** Removes someone from a shift. They are told; no reason is asked or shown. */
export async function removePerson(unit: UnitView, id: string, by: string): Promise<void> {
  const { assignment, shift } = await load(id)
  move(unit, assignment, { from: [...LIVE_STATES], to: 'removed', by, free: true, refusal: { code: 'front-of-house.assignment-ended', reason: 'This person is no longer on the shift.' } })
  released(unit, assignment)
  await notify(unit, 'front-of-house.shift-removed', { to: assignment.accountId, variables: await shiftWords(shift), dedupeKey: `removed:${id}` })
}

export interface AssignResult {
  assignmentId: string
  warnings: Eligibility['unmet']
  /** The crew call whose questions the person has not answered yet (CC1): a warning, never a refusal. */
  crewQuestions: { crewCallId: string, name: string } | null
}

/**
 * A manager puts someone on a shift, confirmed. A requirement the person does not meet is a
 * warning: without `override` the manager is refused with the reasons; with it they go ahead and the
 * override is audited with who allowed it (part 3, "Eligibility").
 */
export async function assignPerson(unit: UnitView, input: { shiftId: string, accountId: string, by: string, override?: boolean }): Promise<AssignResult> {
  const shift = await getShift(input.shiftId)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  if (shift.state !== 'draft' && shift.state !== 'published') refuse('front-of-house.shift-over', 'This shift is cancelled or finished.')
  const verdict = await eligibility(input.accountId, shift)
  if (!verdict.met && !input.override)
    refuse('front-of-house.not-eligible', verdict.reasons[0] ?? 'This person does not meet what the duty needs.', { remedy: 'Choose someone else, or go ahead anyway to override it.', fields: { accountId: [...verdict.reasons, ...verdict.unmet.map(u => u.label)].join(' ') } })
  const id = newId('asg')
  const at = nowMs()
  unit.add({ sql: 'UPDATE front_of_house_shifts SET places_taken = places_taken + 1, updated_at = ? WHERE id = ? AND places_taken < places AND state IN (\'draft\', \'published\')', params: [at, shift.id] })
    .expect(1, { code: 'front-of-house.shift-full', reason: 'Every place on this shift has been taken.', remedy: 'Add a place to the shift first.' })
  unit.add({
    sql: `INSERT INTO front_of_house_assignments (id, shift_id, account_id, state, source, assigned_by, confirmed_at, created_at, updated_at)
      SELECT ?2, ?3, ?1, 'confirmed', 'assigned', ?4, ?5, ?5, ?5 -- not-policy: numbered parameters
       WHERE NOT EXISTS (SELECT 1 FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
         WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.call_at < ?7 AND s.ends_at > ?6) -- not-policy: numbered parameters`,
    params: [input.accountId, id, shift.id, input.by, at, shift.callAt, shift.endsAt],
  }).expect(1, { code: 'front-of-house.shift-overlaps', reason: 'This person is already on a shift at that time.', remedy: 'Take them off the other shift first.' })
  unit.audit({ action: 'create', record: ['front-of-house.assignment', id], detail: { state: 'confirmed', source: 'assigned', override: !verdict.met } })
  await confirmed(unit, { assignmentId: id, shift, accountId: input.accountId, by: input.by })
  const waiting = await questionsWaiting(shift, input.accountId)
  return { assignmentId: id, warnings: verdict.unmet, crewQuestions: waiting ? { crewCallId: waiting.id, name: waiting.name } : null }
}

// ---------------------------------------------------------------------------------------------
// The person (FH-13)

export interface ReleaseResult { state: 'withdrawn' | 'released' | 'release_requested' }

/**
 * The person gives up their place. A request is withdrawn. Outside the release notice a confirmed
 * place is released at once; inside it the person asks, the place stays theirs and the shift needs
 * cover (part 3, "Release notice").
 */
export async function releasePlace(unit: UnitView, id: string, input: { accountId: string, reason?: string | null }): Promise<ReleaseResult> {
  const { assignment, shift } = await load(id)
  if (!await own(id, input.accountId)) refuse('core.access.denied', 'This is not your place.', { status: 403 })
  if (assignment.state === 'requested') {
    move(unit, assignment, { from: ['requested'], to: 'withdrawn', by: input.accountId, free: true, refusal: MOVED_ON })
    released(unit, assignment)
    return { state: 'withdrawn' }
  }
  if (assignment.state !== 'confirmed') refuse('front-of-house.cannot-release', 'This place cannot be given up now.', { remedy: assignment.state === 'release_requested' ? 'You have already asked for cover.' : 'Speak to whoever is leading the night.' })
  const notice = await useSetting('front-of-house.shifts.release-notice') as number
  const second = 1000 // not-policy: settings are whole seconds
  // A shift that changed its time or place after the person took it can be given up at any time (FH-11).
  if (assignment.movedAt !== null || shift.callAt - nowMs() > notice * second) {
    move(unit, assignment, { from: ['confirmed'], to: 'released', by: input.accountId, free: true, reason: input.reason, refusal: MOVED_ON })
    released(unit, assignment)
    await notify(unit, 'front-of-house.shift-released', { to: assignment.accountId, variables: await shiftWords(shift), dedupeKey: `released:${id}`, subject: ['front-of-house.assignment', id] })
    return { state: 'released' }
  }
  move(unit, assignment, { from: ['confirmed'], to: 'release_requested', by: null, free: false, reason: input.reason, refusal: MOVED_ON })
  await notify(unit, 'front-of-house.shift-cover-asked', { to: assignment.accountId, variables: await shiftWords(shift), dedupeKey: `coverasked:${id}:${nowMs()}`, subject: ['front-of-house.assignment', id] })
  const managers = await holdersOf('front-of-house.shift.manage', shift.performanceId ? ['core.performance', shift.performanceId] as const : undefined)
  if (managers.length) await notify(unit, 'front-of-house.cover-needed', { to: managers, variables: await shiftWords(shift), dedupeKey: `cover:${id}` })
  return { state: 'release_requested' }
}

/** The person changes their mind before anyone takes the place. */
export async function keepPlace(unit: UnitView, id: string, accountId: string): Promise<void> {
  const { assignment } = await load(id)
  if (!await own(id, accountId)) refuse('core.access.denied', 'This is not your place.', { status: 403 })
  move(unit, assignment, { from: ['release_requested'], to: 'confirmed', by: null, free: false, refusal: { code: 'front-of-house.cover-taken', reason: 'Someone has already taken your place.' } })
}

// ---------------------------------------------------------------------------------------------
// Cover (FH-14)

/**
 * Another member takes a place offered as cover. One batch confirms the taker (source cover) and
 * releases the first person; the place count does not change. Both are told.
 */
export async function takeCover(unit: UnitView, id: string, accountId: string): Promise<{ assignmentId: string }> {
  const { assignment, shift } = await load(id)
  if (assignment.state !== 'release_requested') refuse('front-of-house.no-cover-needed', 'This place no longer needs cover.')
  if (shift.state !== 'published' || shift.callAt <= nowMs()) refuse('front-of-house.shift-closed', 'This shift has begun or is no longer offered.')
  if (await own(id, accountId)) refuse('front-of-house.own-place', 'This is your own place.', { remedy: 'Keep it instead.' })
  const verdict = await eligibility(accountId, shift)
  if (!verdict.met) refuse('front-of-house.not-eligible', verdict.reasons[0] ?? 'You do not meet what this duty needs.', { remedy: 'Ask the front-of-house manager what the duty needs.' })
  await requireAnswered(shift, accountId)
  const taker = newId('asg')
  const at = nowMs()
  move(unit, assignment, { from: ['release_requested'], to: 'released', by: accountId, free: false, refusal: { code: 'front-of-house.cover-taken', reason: 'Someone has just taken this place.' } })
  unit.add({
    sql: `INSERT INTO front_of_house_assignments (id, shift_id, account_id, state, source, confirmed_at, created_at, updated_at)
      SELECT ?2, ?3, ?1, 'confirmed', 'cover', ?4, ?4, ?4 -- not-policy: numbered parameters
       WHERE NOT EXISTS (SELECT 1 FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
         WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.call_at < ?6 AND s.ends_at > ?5) -- not-policy: numbered parameters`,
    params: [accountId, taker, shift.id, at, shift.callAt, shift.endsAt],
  }).expect(1, { code: 'front-of-house.shift-overlaps', reason: 'You are already on a shift at that time.', remedy: 'Release the other shift first.' })
  unit.audit({ action: 'create', record: ['front-of-house.assignment', taker], detail: { state: 'confirmed', source: 'cover' } })
  released(unit, assignment)
  await confirmed(unit, { assignmentId: taker, shift, accountId })
  await notify(unit, 'front-of-house.cover-taken', { to: assignment.accountId, variables: await shiftWords(shift), dedupeKey: `covered:${id}` })
  return { assignmentId: taker }
}
