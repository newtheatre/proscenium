// Assignments: one person on one shift (part 3, "Assignments"; FH-04, the core of FH-10). Taking a
// place is one batch: the shift must still be open, a place must still be free, and the person must
// be on no other live shift at that time. Each is a guard on the statement that it guards, so two
// people taking the last place at once cannot both have it; the CHECK on places_taken is the backstop.
import { newId, nowMs, refuse, requirements, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { LIVE_STATES } from './db/schema'
import { getDuty, getShift, type Shift } from './shifts'
import { shiftWords } from './words'
import { notify } from '#modules/core'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

export interface SignUpResult { assignmentId: string, state: 'confirmed' | 'requested' }

export interface Eligibility {
  met: boolean
  /** The sources' own sentences, where they gave one. */
  reasons: string[]
  /** Each requirement not met, with its label (a translation key for a fact), for the screen. */
  unmet: { ref: string, label: string }[]
}

/**
 * Checks a person against a duty's requirements at the shift's call time. A requirement whose
 * source is off counts as met: a requirement on a duty restricts who may work, and a missing module
 * never locks people out (part 3, "Eligibility").
 */
export async function eligibility(accountId: string, shift: Pick<Shift, 'id' | 'dutyId' | 'callAt'>, refs?: string[]): Promise<Eligibility> {
  const wanted = refs ?? (await getDuty(shift.dutyId))?.requirements ?? []
  if (!wanted.length) return { met: true, reasons: [], unmet: [] }
  const answers = await requirements.check({ accounts: [accountId], refs: wanted, at: shift.callAt, record: { type: 'front-of-house.shift', id: shift.id }, whenUnavailable: 'met' })
  const unmet = answers.filter(a => a.verdict === 'not-met')
  if (!unmet.length) return { met: true, reasons: [], unmet: [] }
  const labels = await requirements.describe(unmet.map(a => a.ref))
  return {
    met: false,
    reasons: unmet.map(a => [a.reason, a.help].filter(Boolean).join(' ')).filter(Boolean),
    unmet: unmet.map(a => ({ ref: a.ref, label: labels[a.ref]?.label ?? a.ref })),
  }
}

/** A person takes a place themselves. Confirmed at once, or requested when a manager confirms. */
export async function signUp(unit: UnitView, input: { shiftId: string, accountId: string }): Promise<SignUpResult> {
  const shift = await getShift(input.shiftId)
  if (!shift) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  const at = nowMs()
  if (shift.state !== 'published' || shift.signUpClosesAt === null || shift.signUpClosesAt <= at)
    refuse('front-of-house.shift-closed', 'Sign-up for this shift has closed.', { remedy: 'Ask the front-of-house manager if they still need someone.' })
  const verdict = await eligibility(input.accountId, shift)
  if (!verdict.met) refuse('front-of-house.not-eligible', verdict.reasons[0] ?? 'You do not meet what this duty needs.', { remedy: 'Ask the front-of-house manager what the duty needs.' })

  const confirmation = await useSetting('front-of-house.shifts.confirmation')
  const state = confirmation === 'manager' ? 'requested' : 'confirmed'
  const id = newId('asg')

  // Still open for sign-up, judged inside the batch.
  unit.add({ sql: 'UPDATE front_of_house_shifts SET updated_at = updated_at WHERE id = ? AND state = \'published\' AND sign_up_closes_at > ?', params: [shift.id, at] })
    .expect(1, { code: 'front-of-house.shift-closed', reason: 'Sign-up for this shift has just closed.' })
  // A place is free. Whoever's batch runs second finds none left.
  unit.add({ sql: 'UPDATE front_of_house_shifts SET places_taken = places_taken + 1, updated_at = ? WHERE id = ? AND places_taken < places', params: [at, shift.id] })
    .expect(1, { code: 'front-of-house.shift-full', reason: 'Every place on this shift has been taken.', remedy: 'Look for another shift, or ask to be told if a place comes free.' })
  // On no other live shift at the same time, this one included, through the account scope.
  unit.add({
    sql: `INSERT INTO front_of_house_assignments (id, shift_id, account_id, state, source, confirmed_at, created_at, updated_at)
      SELECT ?2, ?3, ?1, ?4, 'sign-up', ?5, ?6, ?6 -- not-policy: numbered parameters
       WHERE NOT EXISTS (SELECT 1 FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
         WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.call_at < ?8 AND s.ends_at > ?7) -- not-policy: numbered parameters`,
    params: [input.accountId, id, shift.id, state, state === 'confirmed' ? at : null, at, shift.callAt, shift.endsAt],
  }).expect(1, { code: 'front-of-house.shift-overlaps', reason: 'You are already on a shift at that time.', remedy: 'Release the other shift first, or choose another.' })
  if (state === 'confirmed') await confirmed(unit, { assignmentId: id, shift, accountId: input.accountId })
  unit.audit({ action: 'create', record: ['front-of-house.assignment', id], detail: { state } })
  return { assignmentId: id, state }
}

/** What follows a confirmation, however it came: the event and the person told (FH-10). */
export async function confirmed(unit: UnitView, input: { assignmentId: string, shift: Shift, accountId: string }): Promise<void> {
  unit.announce('front-of-house.assignment.confirmed', { assignmentId: input.assignmentId, shiftId: input.shift.id, accountId: input.accountId }, { record: ['front-of-house.assignment', input.assignmentId] })
  await notify(unit, 'front-of-house.shift-confirmed', { to: input.accountId, variables: await shiftWords(input.shift), dedupeKey: `confirmed:${input.assignmentId}`, subject: ['front-of-house.assignment', input.assignmentId] })
}
