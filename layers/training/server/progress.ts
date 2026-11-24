// Sign-offs and the training records they earn (part 3, S1 to S6, A1 to A6, L1 to L4; TR-05 to
// TR-08, TR-19, TR-20). Every sign-off evaluates the award in the same unit of work: if every step
// the person needs is met, the training record, its audit entry and its event go in the same batch.
// Nothing here is stored as a flag; a person's standing is read from rows and dates when asked.
import { all, cache, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount, notify } from '#modules/core'
import { SIGNED_BY, standingOf, type RecordState, type RevokeCode, type SignOffKind, type Standing, type StepKind } from '../shared/states'
import { courseOrRefuse, getStep, stepsOf, type Course, type Step } from './courses'
import { addDays, endOfLocalDay, theatreDay } from './days'

const SECOND = 1000 // not-policy: settings are whole seconds

export interface TrainingRecord {
  id: string
  accountId: string
  courseId: string
  versionId: string
  origin: 'steps' | 'direct' | 'import'
  awardedAt: number
  expiresAt: number | null
  naturalExpiresAt: number | null
  cutReason: 'material-changed' | null
  status: RecordState
  endedAt: number | null
  revokeCode: RevokeCode | null
}

const RECORD = `SELECT id, account_id AS accountId, course_id AS courseId, version_id AS versionId, origin, awarded_at AS awardedAt, expires_at AS expiresAt,
  natural_expires_at AS naturalExpiresAt, cut_reason AS cutReason, status, ended_at AS endedAt, revoke_code AS revokeCode FROM training_records`

/** The person's latest training record for a course, whichever of their merged accounts holds it (C7). */
async function latestRecord(accountId: string, courseId: string): Promise<TrainingRecord | null> {
  return first<TrainingRecord>(`${RECORD} WHERE course_id = ?1 AND account_id IN (${accountScopeSql('?2')}) ORDER BY awarded_at DESC, id DESC LIMIT 1`, courseId, accountId)
}

/** Each step of the course, by id, with the step it carries from, across every version. */
async function carryMap(courseId: string): Promise<Map<string, string | null>> {
  const rows = await all<{ id: string, carries: string | null }>(
    'SELECT s.id, s.carries_step_id AS carries FROM training_course_steps s JOIN training_course_versions v ON v.id = s.version_id WHERE v.course_id = ?', courseId)
  return new Map(rows.map(r => [r.id, r.carries]))
}

/** A step and every earlier step it carries from: a sign-off for any of them counts for it (V3). */
function lineOf(stepId: string, carries: Map<string, string | null>): Set<string> {
  const line = new Set<string>()
  for (let id: string | null | undefined = stepId; id && !line.has(id); id = carries.get(id)) line.add(id)
  return line
}

export type Basis = 'first' | 'renewal' | 'retrain'

/**
 * Which steps of the live version the person needs, and from when their sign-offs count (A2). A
 * renewal or a retraining counts only what was done after the training record it follows.
 */
export async function neededSteps(course: Course, accountId: string, at = nowMs()): Promise<{ steps: Step[], basis: Basis, since: number | null, previous: TrainingRecord | null }> {
  const steps = course.liveVersionId ? await stepsOf(course.liveVersionId) : []
  const previous = await latestRecord(accountId, course.id)
  const grace = await useSetting('training.records.renew-grace') as number * SECOND
  let basis: Basis = 'first'
  if (previous && previous.status !== 'revoked') {
    const current = previous.status === 'awarded' && (previous.expiresAt === null || previous.expiresAt >= at)
    const inGrace = previous.status === 'awarded' && previous.expiresAt !== null && previous.expiresAt < at && previous.expiresAt + grace >= at
    if (current && previous.cutReason) basis = 'retrain'
    else if (current || inGrace) basis = 'renewal'
  }
  const needed = steps.filter(s => basis === 'retrain' ? !s.carriesStepId : basis === 'renewal' ? s.neededFor !== 'first' : s.neededFor !== 'renewal')
  const since = previous ? (previous.status === 'revoked' ? previous.endedAt : previous.awardedAt) : null
  return { steps: needed, basis, since, previous }
}

/** A sign-off written in this unit, not yet readable. */
export interface PendingSignOff { id: string, stepId: string, kind: SignOffKind, occurredOn: string, evidenceExpiresOn?: string | null }
interface Counting { id: string, stepId: string, occurredOn: string, evidenceExpiresOn: string | null }

/**
 * The sign-offs that count towards the course now (S1, S3): not voided, made after `since`, done
 * within the progress window, and for evidence, while the evidence has not expired.
 */
async function counting(accountId: string, courseId: string, since: number | null, today: string): Promise<Counting[]> {
  const window = await useSetting('training.progress.complete-within') as number
  const from = addDays(today, -Math.ceil(window / 86_400)) // not-policy: seconds in a day
  return all<Counting>(
    `SELECT s.id, s.step_id AS stepId, s.occurred_on AS occurredOn, e.expires_on AS evidenceExpiresOn FROM training_sign_offs s
       LEFT JOIN training_evidence e ON e.id = s.evidence_id
      WHERE s.course_id = ?1 AND s.account_id IN (${accountScopeSql('?2')}) AND s.kind != 'void'
        AND NOT EXISTS (SELECT 1 FROM training_sign_offs v WHERE v.voids_id = s.id)
        AND (?3 IS NULL OR s.created_at > ?3) -- not-policy: bound parameters
        AND (CASE WHEN s.kind = 'evidence' THEN e.expires_on IS NULL OR e.expires_on >= ?4 ELSE s.occurred_on >= ?5 END)`, // not-policy: bound parameters
    courseId, accountId, since, today, from,
  )
}

export interface StepProgress { stepId: string, kind: StepKind, title: string, needed: number, done: number, met: boolean }

/** The person's progress on each step they need, and whether that completes the course (S1). */
export async function progressOn(course: Course, accountId: string, pending: PendingSignOff[] = []): Promise<{ basis: Basis, steps: StepProgress[], complete: boolean, used: Counting[], previous: TrainingRecord | null }> {
  const at = nowMs()
  const today = await theatreDay(at)
  const { steps, basis, since, previous } = await neededSteps(course, accountId, at)
  const carries = await carryMap(course.id)
  const rows = [...await counting(accountId, course.id, since, today), ...pending.map(p => ({ id: p.id, stepId: p.stepId, occurredOn: p.occurredOn, evidenceExpiresOn: p.evidenceExpiresOn ?? null }))]
  const used: Counting[] = []
  const progress = steps.map((step) => {
    const line = lineOf(step.id, carries)
    const mine = rows.filter(r => line.has(r.stepId))
    used.push(...mine.slice(0, step.timesRequired))
    return { stepId: step.id, kind: step.kind, title: step.title, needed: step.timesRequired, done: Math.min(mine.length, step.timesRequired), met: mine.length >= step.timesRequired }
  })
  return { basis, steps: progress, complete: steps.length > 0 && progress.every(s => s.met), used, previous }
}

/**
 * The expiry of a training record awarded now (A3, A4): the course's validity from today, or from the
 * old expiry for a renewal inside the window, brought forward to the earliest evidence expiry.
 */
async function expiryOf(course: Course, previous: TrainingRecord | null, basis: Basis, evidence: (string | null)[], at: number): Promise<number | null> {
  let expires: number | null = null
  if (course.expires && course.validFor) {
    const window = await useSetting('training.records.renew-window') as number * SECOND
    const fromOld = basis === 'renewal' && previous?.status === 'awarded' && previous.expiresAt !== null && previous.expiresAt >= at && previous.expiresAt - window <= at
    const start = fromOld ? previous!.expiresAt! : at
    expires = await endOfLocalDay(await theatreDay(start + course.validFor * SECOND))
  }
  for (const day of evidence) {
    if (!day) continue
    const end = await endOfLocalDay(day)
    if (expires === null || end < expires) expires = end
  }
  return expires
}

/** Writes a training record, superseding every awarded one for the person and course (A5). */
async function writeRecord(unit: UnitView, input: { accountId: string, course: Course, versionId: string, origin: 'steps' | 'direct', signOffIds: string[], expiresAt: number | null, by: string | null, reason: string | null }): Promise<string> {
  const id = newId('trec')
  const at = nowMs()
  const person = await canonicalAccount(input.accountId)
  const keep = await useSetting('training.retention.records') as number * SECOND
  // Marked superseded by itself first, so neither the one-awarded index nor the reference to the
  // new row trips before the new row exists; the third statement points them at it.
  unit.add({
    sql: `UPDATE training_records SET status = 'superseded', superseded_by = id, ended_at = ?1, retention_due_at = ?1 + ?2, updated_at = ?1
      WHERE course_id = ?3 AND status = 'awarded' AND account_id IN (${accountScopeSql('?4')})`, // not-policy: bound parameters
    params: [at, keep, input.course.id, person],
  })
  unit.add({
    sql: `INSERT INTO training_records (id, account_id, course_id, version_id, origin, sign_off_ids, awarded_at, awarded_by, direct_reason, expires_at, status, retention_due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awarded', ?, ?, ?)`,
    params: [id, person, input.course.id, input.versionId, input.origin, JSON.stringify(input.signOffIds), at, input.by, input.reason, input.expiresAt, input.expiresAt === null ? null : input.expiresAt + keep, at, at],
  })
  unit.add({ sql: 'UPDATE training_records SET superseded_by = ?1 WHERE course_id = ?2 AND status = \'superseded\' AND superseded_by = id', params: [id, input.course.id] })
  unit.announce('training.record.awarded', { recordId: id, accountId: person, courseId: input.course.id, expiresAt: input.expiresAt }, { record: ['training.record', id] })
  unit.audit({ action: 'create', record: ['training.record', id], detail: { origin: input.origin, course: input.course.id, account: person } })
  await notify(unit, 'training.record-awarded', { to: person, variables: { course: input.course.title }, dedupeKey: `awarded:${id}`, subject: ['training.record', id] })
  return id
}

/** Evaluates the award after sign-offs written in this unit (A1). Gives the new record's id, if any. */
export async function evaluateAward(unit: UnitView, course: Course, accountId: string, pending: PendingSignOff[]): Promise<string | null> {
  if (course.status !== 'live' || !course.liveVersionId) return null
  const progress = await progressOn(course, accountId, pending)
  if (!progress.complete) return null
  const at = nowMs()
  const expiresAt = await expiryOf(course, progress.previous, progress.basis, progress.used.map(u => u.evidenceExpiresOn), at)
  return writeRecord(unit, { accountId, course, versionId: course.liveVersionId, origin: 'steps', signOffIds: progress.used.map(u => u.id), expiresAt, by: null, reason: null })
}

/** Whether two accounts are one person, merges followed. */
export async function samePerson(a: string | undefined, b: string): Promise<boolean> {
  return !!a && await canonicalAccount(a) === await canonicalAccount(b)
}

async function liveStepOrRefuse(stepId: string, courseId: string): Promise<Step> {
  const step = await getStep(stepId)
  if (!step || step.courseId !== courseId) refuse('training.step.not-found', 'There is no such step on this course.', { status: 404 })
  if (step.versionStatus !== 'live') refuse('training.step.not-live', 'That step is not on the version of the course people take now.', { status: 409, remedy: 'Reload the course.' })
  return step
}

async function checkDay(occurredOn: string): Promise<void> {
  if (occurredOn > await theatreDay(nowMs())) refuse('training.sign-off.future', 'A sign-off is for something already done.', { status: 422, fields: { occurredOn: 'Choose today or an earlier day.' } })
}

export function addSignOff(unit: UnitView, row: { accountId: string, courseId: string, stepId: string, kind: SignOffKind, signedBy: string | null, occurredOn: string, note?: string | null, placeId?: string, attemptId?: string, source?: { id: string, ref: string, confirmedBy: string } }): PendingSignOff {
  const id = newId('tsof')
  // An occurrence already signed off by a read running alongside is skipped, not refused (H2, H3).
  const once = row.kind === 'activity' ? ' ON CONFLICT DO NOTHING' : ''
  unit.add({
    sql: `INSERT INTO training_sign_offs (id, account_id, course_id, step_id, kind, signed_by, occurred_on, place_id, attempt_id, source_id, source_ref, confirmed_by, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)${once}`,
    params: [id, row.accountId, row.courseId, row.stepId, row.kind, row.signedBy, row.occurredOn, row.placeId ?? null, row.attemptId ?? null,
      row.source?.id ?? null, row.source?.ref ?? null, row.source?.confirmedBy ?? null, row.note ?? null, nowMs()],
  })
  unit.announce('training.sign-off.recorded', { signOffId: id, accountId: row.accountId, courseId: row.courseId, stepId: row.stepId, kind: row.kind }, { record: ['training.course', row.courseId] })
  unit.audit({ action: 'create', record: ['training.course', row.courseId], detail: { signOff: id, account: row.accountId, step: row.stepId, kind: row.kind } })
  return { id, stepId: row.stepId, kind: row.kind, occurredOn: row.occurredOn }
}

/**
 * A trainer signs a person off on a practical step (S2, S4; TR-05): a day not in the future, never
 * themself, whatever role they hold.
 */
export async function signOffPractical(unit: UnitView, actor: Actor, courseId: string, input: { accountId: string, stepId: string, occurredOn: string, note?: string | null }): Promise<{ signOffId: string, recordId: string | null }> {
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a live course takes sign-offs.', { status: 409 })
  const step = await liveStepOrRefuse(input.stepId, courseId)
  if (SIGNED_BY[step.kind] !== 'trainer') refuse('training.sign-off.wrong-kind', 'A trainer signs off practical steps only; this step is signed off another way.', { status: 422 })
  if (await samePerson(actor.accountId, input.accountId)) refuse('training.own-sign-off', 'You cannot sign yourself off.', { status: 403, remedy: 'Ask another trainer of the course.' })
  await checkDay(input.occurredOn)
  const person = await canonicalAccount(input.accountId)
  const pending = addSignOff(unit, { accountId: person, courseId, stepId: step.id, kind: 'trainer', signedBy: actor.accountId ?? null, occurredOn: input.occurredOn, note: input.note })
  return { signOffId: pending.id, recordId: await evaluateAward(unit, course, person, [pending]) }
}

const OPENED_FOR = 86_400 // not-policy: a day, the longest a reading confirmation waits after the material opens

const openedKey = (actor: Actor, stepId: string) => `training:opened:${actor.sessionId ?? actor.accountId}:${stepId}`

/** Notes that the person opened a reading step's material in this session (TR-08). */
export async function markOpened(actor: Actor, courseId: string, stepId: string): Promise<void> {
  const step = await liveStepOrRefuse(stepId, courseId)
  if (step.kind !== 'reading') refuse('training.sign-off.wrong-kind', 'Only a reading step is confirmed by reading it.', { status: 422 })
  await cache.put(openedKey(actor, stepId), true, { ttl: OPENED_FOR })
}

/** The person confirms they have read a reading step, once the material was opened in this session. */
export async function confirmReading(unit: UnitView, actor: Actor, courseId: string, stepId: string): Promise<{ signOffId: string, recordId: string | null }> {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a live course takes sign-offs.', { status: 409 })
  const step = await liveStepOrRefuse(stepId, courseId)
  if (step.kind !== 'reading') refuse('training.sign-off.wrong-kind', 'Only a reading step is confirmed by reading it.', { status: 422 })
  if (!await cache.get(openedKey(actor, stepId))) refuse('training.reading.not-opened', 'Open the material before confirming you have read it.', { status: 409 })
  const person = await canonicalAccount(actor.accountId)
  const pending = addSignOff(unit, { accountId: person, courseId, stepId, kind: 'self', signedBy: null, occurredOn: await theatreDay(nowMs()) })
  return { signOffId: pending.id, recordId: await evaluateAward(unit, course, person, [pending]) }
}

/**
 * Voids a sign-off with a reason (S5): by whoever made it, or a holder of training.record.revoke.
 * A training record already awarded stands; revoking it is a separate act.
 */
export async function voidSignOff(unit: UnitView, actor: Actor, signOffId: string, note: string, options: { mayVoidAny: boolean }): Promise<void> {
  const row = await first<{ id: string, account_id: string, course_id: string, step_id: string, kind: string, signed_by: string | null }>('SELECT id, account_id, course_id, step_id, kind, signed_by FROM training_sign_offs WHERE id = ?', signOffId)
  if (!row || row.kind === 'void') refuse('training.sign-off.not-found', 'There is no such sign-off.', { status: 404 })
  const own = !!row.signed_by && await samePerson(actor.accountId, row.signed_by)
  if (!own && !options.mayVoidAny) refuse('training.sign-off.not-yours', 'Only the person who signed this off, or someone who can revoke training, can void it.', { status: 403 })
  unit.add({
    sql: `INSERT INTO training_sign_offs (id, account_id, course_id, step_id, kind, signed_by, occurred_on, voids_id, note, created_at)
      SELECT ?, account_id, course_id, step_id, 'void', ?, ?, id, ?, ? FROM training_sign_offs WHERE id = ? AND NOT EXISTS (SELECT 1 FROM training_sign_offs WHERE voids_id = ?)`,
    params: [newId('tsof'), actor.accountId ?? null, await theatreDay(nowMs()), note, nowMs(), signOffId, signOffId],
  }).expect(1, { code: 'training.sign-off.voided', reason: 'This sign-off has already been voided.' })
  unit.announce('training.sign-off.voided', { signOffId, accountId: row.account_id, courseId: row.course_id }, { record: ['training.course', row.course_id] })
  unit.audit({ action: 'state', record: ['training.course', row.course_id], detail: { voided: signOffId, account: row.account_id } })
}

/**
 * Awards a training record without the steps (A6; TR-20): a reason, an expiry no later than the
 * course allows, and never to oneself.
 */
export async function directAward(unit: UnitView, actor: Actor, courseId: string, input: { accountId: string, reason: string, expiresOn: string | null }): Promise<string> {
  const course = await courseOrRefuse(courseId)
  if (!course.liveVersionId) refuse('training.course.not-live', 'Publish the course before awarding it.', { status: 409 })
  if (await samePerson(actor.accountId, input.accountId)) refuse('training.own-award', 'You cannot award a training record to yourself.', { status: 403, remedy: 'Ask another person who can award it.' })
  const at = nowMs()
  const today = await theatreDay(at)
  let expiresAt: number | null = null
  if (course.expires) {
    if (!input.expiresOn) refuse('training.award.expiry-needed', 'This course lapses, so give the last day it is valid.', { status: 422, fields: { expiresOn: 'Give a date.' } })
    const latest = await theatreDay(at + course.validFor! * SECOND)
    if (input.expiresOn < today || input.expiresOn > latest) refuse('training.award.expiry-out-of-range', 'The expiry must be between today and as long as the course allows.', { status: 422, fields: { expiresOn: `Choose a day from today to ${latest}.` } })
    expiresAt = await endOfLocalDay(input.expiresOn)
  }
  else if (input.expiresOn) {
    refuse('training.award.no-expiry', 'This course never lapses, so give no expiry.', { status: 422, fields: { expiresOn: 'Leave it empty.' } })
  }
  return writeRecord(unit, { accountId: input.accountId, course, versionId: course.liveVersionId, origin: 'direct', signOffIds: [], expiresAt, by: actor.accountId ?? null, reason: input.reason })
}

/** Revokes a training record with a code and a note (L2; TR-19). It cannot be undone. */
export async function revokeRecord(unit: UnitView, actor: Actor, recordId: string, input: { code: RevokeCode, note: string }): Promise<void> {
  const row = await first<{ account_id: string, course_id: string, status: string }>('SELECT account_id, course_id, status FROM training_records WHERE id = ?', recordId)
  if (!row) refuse('training.record.not-found', 'There is no such training record.', { status: 404 })
  const at = nowMs()
  const keep = await useSetting('training.retention.records') as number * SECOND
  unit.add({
    sql: 'UPDATE training_records SET status = \'revoked\', ended_at = ?1, revoked_by = ?2, revoke_code = ?3, revoke_note = ?4, retention_due_at = ?1 + ?5, updated_at = ?1 WHERE id = ?6 AND status = \'awarded\'',
    params: [at, actor.accountId ?? null, input.code, input.note, keep, recordId],
  }).expect(1, { code: 'training.record.not-current', reason: 'Only an awarded training record can be revoked.' })
  unit.announce('training.record.revoked', { recordId, accountId: row.account_id, courseId: row.course_id }, { record: ['training.record', recordId] })
  unit.audit({ action: 'state', record: ['training.record', recordId], detail: { revoked: input.code } })
  const course = await courseOrRefuse(row.course_id)
  await notify(unit, 'training.record-revoked', { to: row.account_id, variables: { course: course.title }, dedupeKey: `revoked:${recordId}`, subject: ['training.record', recordId] })
}

export interface RecordView extends TrainingRecord { courseTitle: string, standing: Standing }

/** A person's training records, newest first, each with what a reader concludes now (L1 to L4). */
export async function recordsOf(accountId: string): Promise<RecordView[]> {
  const at = nowMs()
  const warn = await useSetting('training.records.warn-before') as number * SECOND
  const rows = await all<TrainingRecord & { courseTitle: string }>(
    `SELECT r.*, c.title AS courseTitle FROM (${RECORD}) r JOIN training_courses c ON c.id = r.courseId WHERE r.accountId IN (${accountScopeSql('?1')}) ORDER BY r.awardedAt DESC`,
    accountId,
  )
  return rows.map(r => ({ ...r, standing: standingOf(r, at, warn) }))
}
