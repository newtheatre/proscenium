// Certificates and declarations (second-round part 3, E1 to E4; amended part 3, E5 to E9; TR-21,
// TR-46 to TR-48, TR-52). Evidence signs nothing off until a verifier other than its subject checks
// it; verifying writes the `evidence` sign-off and evaluates the award in the same unit (E1).
import { all, can, createUnit, files as store, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount, holdersOf, notify } from '#modules/core'
import { addResponse } from '#modules/forms'
import { courseOrRefuse, getStep, type Step } from './courses'
import { theatreDay } from './days'
import type { EvidenceInput, SeenInput } from './inputs'
import { addSignOff, evaluateAward, samePerson } from './progress'

const SECOND = 1000 // not-policy: settings are whole seconds
const OWNER = 'training.evidence'
export const EVIDENCE_SLOT = 'training.evidence-file'
const DECLARATION_SLOT = 'training.declaration'
const VERIFY = 'training.evidence.verify' as const

export interface Evidence {
  id: string
  accountId: string
  courseId: string
  stepId: string
  kind: 'certificate' | 'declaration'
  issuer: string | null
  reference: string | null
  issuedOn: string | null
  expiresOn: string | null
  qualification: string | null
  statement: string | null
  organisation: string | null
  doneFrom: string | null
  doneTo: string | null
  linkUrl: string | null
  referee: string | null
  responseId: string | null
  fileId: string | null
  seenOnly: boolean
  state: 'submitted' | 'verified' | 'rejected' | 'withdrawn'
  submittedBy: string
  decidedBy: string | null
  decidedAt: number | null
  rejectReason: string | null
  createdAt: number
}

const EVIDENCE = `SELECT id, account_id AS accountId, course_id AS courseId, step_id AS stepId, kind, issuer, reference, issued_on AS issuedOn, expires_on AS expiresOn,
  qualification, statement, organisation, done_from AS doneFrom, done_to AS doneTo, link_url AS linkUrl, referee, response_id AS responseId, file_id AS fileId,
  seen_only AS seenOnly, state, submitted_by AS submittedBy, decided_by AS decidedBy, decided_at AS decidedAt, reject_reason AS rejectReason, created_at AS createdAt
  FROM training_evidence`

type EvidenceRow = Omit<Evidence, 'seenOnly'> & { seenOnly: unknown }
const row = (r: EvidenceRow): Evidence => ({ ...r, seenOnly: !!r.seenOnly })

export async function getEvidence(id: string): Promise<Evidence | null> {
  const r = await first<EvidenceRow>(`${EVIDENCE} WHERE id = ?`, id)
  return r ? row(r) : null
}

async function evidenceOrRefuse(id: string): Promise<Evidence> {
  const found = await getEvidence(id)
  if (!found) refuse('training.evidence.not-found', 'There is no such evidence.', { status: 404 })
  return found
}

/** Whether the step is a live certificate or declaration step of a live course. */
async function evidenceStepOrRefuse(courseId: string, stepId: string): Promise<Step & { courseId: string }> {
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a live course takes evidence.', { status: 409 })
  const step = await getStep(stepId)
  if (!step || step.courseId !== courseId || (step.kind !== 'certificate' && step.kind !== 'declaration')) refuse('training.step.not-found', 'There is no such certificate or declaration step on this course.', { status: 404 })
  if (step.versionStatus !== 'live') refuse('training.step.not-live', 'That step is not on the version of the course people take now.', { status: 409, remedy: 'Reload the course.' })
  return step
}

/** Who the evidence is for, and that the actor may send it: themself when self-submit is on, or a verifier for them. */
async function subjectOf(actor: Actor, courseId: string, accountId: string | undefined): Promise<{ person: string, staff: boolean }> {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  if (accountId && !await samePerson(actor.accountId, accountId)) {
    if (!(await can(actor, VERIFY, ['training.course', courseId])).allowed) refuse('training.evidence.not-yours', 'Only somebody who checks evidence can send it for someone else.', { status: 403 })
    const person = await canonicalAccount(accountId)
    if (!await first('SELECT 1 FROM core_accounts WHERE id = ?', person)) refuse('core.account.not-found', 'There is no such person.', { status: 404 })
    return { person, staff: true }
  }
  if (!await useSetting('training.evidence.self-submit')) refuse('training.evidence.self-submit-off', 'Certificates are sent in by staff here, not by members.', { status: 403, remedy: 'Show your certificate to whoever runs training.' })
  return { person: await canonicalAccount(actor.accountId), staff: false }
}

/**
 * Stores an uploaded evidence file, checked by core before it can be used (E2, E4). The file waits
 * under a new evidence id, which the person sends with the evidence.
 */
export async function uploadEvidenceFile(unit: UnitView, actor: Actor, { courseId, stepId }: { courseId: string, stepId: string }, input: { accountId?: string, name?: string, bytes: Uint8Array }): Promise<{ evidenceId: string, fileId: string, state: 'pending' }> {
  const step = await evidenceStepOrRefuse(courseId, stepId)
  await subjectOf(actor, courseId, input.accountId)
  if (step.evidenceFile === 'forbidden') refuse('training.evidence-forbidden', 'This step records only that somebody saw the original, so no file is kept.', { status: 422, fields: { file: 'forbidden' } })
  if (input.bytes.length === 0) refuse('core.files.empty', 'The file is empty.', { status: 422, fields: { file: 'empty' } })
  const evidenceId = newId('tevd')
  const id = newId('fil', { random: true })
  const objectKey = `files/${crypto.randomUUID()}`
  await store.put(objectKey, input.bytes)
  const digest = await crypto.subtle.digest('SHA-256', input.bytes as Uint8Array<ArrayBuffer>)
  const sha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
  unit.add({
    sql: "INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, original_name, text_class, media_type, byte_size, sha256, access, state, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'personal', 'application/octet-stream', ?, ?, 'record', 'pending', ?, ?)",
    params: [id, objectKey, OWNER, evidenceId, EVIDENCE_SLOT, input.name ?? null, input.bytes.length, sha, actor.accountId ?? null, nowMs()],
  })
  unit.enqueue('core.check-file', { fileId: id })
  unit.audit({ action: 'create', record: ['core.file', id], detail: { slot: EVIDENCE_SLOT } })
  return { evidenceId, fileId: id, state: 'pending' }
}

/** What the step says about a file or a reference number: forbidden, required or optional (E2). */
function checkFileRule(step: Step, input: EvidenceInput): void {
  if (step.evidenceFile === 'forbidden' && (input.fileId || input.reference))
    refuse('training.evidence-forbidden', 'This step records only that somebody saw the original, so no file or reference number is kept.', { status: 422, remedy: 'Show the original to whoever checks evidence.' })
  if (step.kind === 'certificate' && step.evidenceFile === 'forbidden') refuse('training.evidence-forbidden', 'This step is recorded by whoever checks evidence, once they have seen the original.', { status: 422, remedy: 'Show the original to whoever checks evidence.' })
  if (step.evidenceFile === 'required' && !input.fileId) refuse('training.evidence.file-required', 'This step needs a copy of the certificate.', { status: 422, fields: { file: 'Add a file.' } })
}

/** A certificate's issuer, dates and qualification, as the step asks for them (E7). */
function checkCertificate(step: Step, input: EvidenceInput): void {
  if (!input.issuer || !input.issuedOn) refuse('training.evidence.incomplete', 'Say who issued it and when.', { status: 422, fields: { ...(!input.issuer ? { issuer: 'Required.' } : {}), ...(!input.issuedOn ? { issuedOn: 'Required.' } : {}) } })
  if (step.evidenceExpiry === 'required' && !input.expiresOn) refuse('training.evidence.incomplete', 'Give the date it expires.', { status: 422, fields: { expiresOn: 'Required.' } })
  if (step.evidenceExpiry === 'none' && input.expiresOn) refuse('training.evidence.no-expiry', 'This step does not take an expiry date.', { status: 422, fields: { expiresOn: 'Leave this empty.' } })
  const listed = step.qualifications ?? []
  if (!listed.length) return
  if (!input.qualification) refuse('training.evidence.incomplete', 'Choose the qualification.', { status: 422, fields: { qualification: 'Required.' } })
  if (!listed.some(q => q.title === input.qualification) && !step.otherQualification)
    refuse('training.evidence.qualification-not-listed', 'This step accepts only the qualifications listed.', { status: 422, fields: { qualification: 'Choose one from the list.' } })
}

/** The dates in order, nothing issued in the future and nothing already expired. */
async function checkDates(input: EvidenceInput): Promise<void> {
  if (input.issuedOn && input.expiresOn && input.expiresOn <= input.issuedOn) refuse('training.evidence.dates', 'The expiry date is after the date it was issued.', { status: 422, fields: { expiresOn: 'Choose a later date.' } })
  if (input.doneFrom && input.doneTo && input.doneTo < input.doneFrom) refuse('training.evidence.dates', 'The end date is on or after the start.', { status: 422, fields: { doneTo: 'Choose a later date.' } })
  const today = await theatreDay(nowMs())
  if (input.issuedOn && input.issuedOn > today) refuse('training.evidence.dates', 'It was issued on or before today.', { status: 422, fields: { issuedOn: 'Choose today or earlier.' } })
  if (input.expiresOn && input.expiresOn < today) refuse('training.evidence.expired', 'This has already expired, so it cannot count.', { status: 422, fields: { expiresOn: 'It has expired.' } })
}

/** The uploaded file belongs to this evidence, is not used yet, and core has passed it (E4). */
async function checkFile(evidenceId: string, fileId: string): Promise<void> {
  const file = await first<{ state: string }>('SELECT state FROM core_files WHERE id = ? AND owner_type = ? AND owner_id = ? AND slot = ? AND attached_at IS NULL', fileId, OWNER, evidenceId, EVIDENCE_SLOT)
  if (!file) refuse('core.files.not-found', 'There is no such file for this evidence.', { status: 404 })
  if (file.state === 'pending') refuse('core.files.not-ready', 'The file is still being checked. Try again in a moment.', { status: 409 })
  if (file.state !== 'ready') refuse('core.files.not-ready', 'This file was refused, so it cannot be used.', { status: 409, remedy: 'Upload it again as a PDF or a photo.' })
}

/** A declaration's answers to the step's own questions, sent to Forms in the caller's unit (E5). */
async function declarationAnswers(unit: UnitView, actor: Actor, { courseId, step, input }: { courseId: string, step: Step, input: EvidenceInput }): Promise<string | null> {
  if (!step.formId || !step.formVersionId) return null
  if (!input.answers) refuse('training.evidence.incomplete', 'Answer the questions as well.', { status: 422, fields: { answers: 'Required.' } })
  return (await addResponse(unit, { slot: DECLARATION_SLOT, subject: courseId, formId: step.formId, actor, answers: input.answers as Parameters<typeof addResponse>[1]['answers'], versionId: step.formVersionId })).responseId
}

interface NewEvidence { id: string, person: string, courseId: string, step: Step, input: EvidenceInput, responseId: string | null, by: string | null, at: number }

function insertEvidence(unit: UnitView, { id, person, courseId, step, input, responseId, by, at }: NewEvidence): void {
  const optional = (v: string | null | undefined) => v ?? null
  unit.add({
    sql: `INSERT INTO training_evidence (id, account_id, course_id, step_id, kind, issuer, reference, issued_on, expires_on, qualification, statement, organisation, done_from, done_to,
        link_url, referee, response_id, file_id, seen_only, state, submitted_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'submitted', ?, ?, ?)`,
    params: [id, person, courseId, step.id, step.kind, ...[input.issuer, input.reference, input.issuedOn, input.expiresOn].map(optional),
      step.kind === 'certificate' ? optional(input.qualification) : null, ...[input.statement, input.organisation, input.doneFrom, input.doneTo, input.linkUrl, input.referee].map(optional),
      responseId, optional(input.fileId), by, at, at],
  })
}

/**
 * Sends a certificate or a declaration for checking (TR-21, TR-46): it signs nothing off yet. A
 * declaration's questions go to Forms in the same unit (E5); a certificate names a listed
 * qualification, or another where the step allows it (E7).
 */
export async function submitEvidence(unit: UnitView, actor: Actor, courseId: string, input: EvidenceInput): Promise<string> {
  const step = await evidenceStepOrRefuse(courseId, input.stepId)
  const { person } = await subjectOf(actor, courseId, input.accountId)
  const certificate = step.kind === 'certificate'
  checkFileRule(step, input)
  if (certificate) checkCertificate(step, input)
  else if (!input.statement) refuse('training.evidence.incomplete', 'Say what you did.', { status: 422, fields: { statement: 'Required.' } })
  await checkDates(input)
  if (await first(`SELECT 1 FROM training_evidence WHERE step_id = ?1 AND state = 'submitted' AND account_id IN (${accountScopeSql('?2')})`, step.id, person))
    refuse('training.evidence.waiting', 'Evidence for this step is already waiting to be checked.', { status: 409, remedy: 'Withdraw it first to send another.' })
  const id = input.evidenceId ?? newId('tevd')
  if (input.fileId) await checkFile(id, input.fileId)
  const responseId = certificate ? null : await declarationAnswers(unit, actor, { courseId, step, input })
  const at = nowMs()
  insertEvidence(unit, { id, person, courseId, step, input, responseId, by: actor.accountId ?? null, at })
  if (input.fileId) unit.add({ sql: 'UPDATE core_files SET attached_at = ? WHERE id = ? AND state = \'ready\' AND attached_at IS NULL', params: [at, input.fileId] }).expect(1)
  unit.announce('training.evidence.submitted', { evidenceId: id, courseId }, { record: ['training.evidence', id] })
  unit.audit({ action: 'create', record: ['training.evidence', id], detail: { kind: step.kind, step: step.id } })
  const course = await courseOrRefuse(courseId)
  const verifiers = (await holdersOf(VERIFY, ['training.course', courseId])).filter(v => v !== person)
  if (verifiers.length) await notify(unit, 'training.evidence-submitted', { to: verifiers.map(accountId => ({ accountId, dedupeKey: `evidence:${id}:${accountId}` })), variables: { course: course.title }, subject: ['training.evidence', id] })
  return id
}

/** A verifier records that they saw the original, keeping nothing of it (E2): verified at once, never for themself. */
export async function recordSeen(unit: UnitView, actor: Actor, courseId: string, input: SeenInput): Promise<{ evidenceId: string, recordId: string | null }> {
  const step = await evidenceStepOrRefuse(courseId, input.stepId)
  if (step.kind !== 'certificate') refuse('training.sign-off.wrong-kind', 'Only a certificate can be recorded as seen.', { status: 422 })
  if (await samePerson(actor.accountId, input.accountId)) refuse('training.own-evidence', 'This is your own certificate. Somebody else must check it.', { status: 403 })
  const person = await canonicalAccount(input.accountId)
  if (!await first('SELECT 1 FROM core_accounts WHERE id = ?', person)) refuse('core.account.not-found', 'There is no such person.', { status: 404 })
  const today = await theatreDay(nowMs())
  if (input.issuedOn > today) refuse('training.evidence.dates', 'It was issued on or before today.', { status: 422, fields: { issuedOn: 'Choose today or earlier.' } })
  if (input.expiresOn && input.expiresOn < today) refuse('training.evidence.expired', 'This has already expired, so it cannot count.', { status: 422, fields: { expiresOn: 'It has expired.' } })
  if (step.evidenceExpiry === 'required' && !input.expiresOn) refuse('training.evidence.incomplete', 'Give the date it should be looked at again.', { status: 422, fields: { expiresOn: 'Required.' } })
  const id = newId('tevd')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO training_evidence (id, account_id, course_id, step_id, kind, issuer, issued_on, expires_on, seen_only, state, submitted_by, decided_by, decided_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'certificate', ?, ?, ?, 1, 'verified', ?, ?, ?, ?, ?)`,
    params: [id, person, courseId, step.id, input.issuer, input.issuedOn, step.evidenceExpiry === 'none' ? null : input.expiresOn ?? null, actor.accountId ?? null, actor.accountId ?? null, at, at, at],
  })
  unit.audit({ action: 'create', record: ['training.evidence', id], detail: { seenOnly: true, step: step.id } })
  return { evidenceId: id, recordId: await signOffEvidence(unit, actor, { id, accountId: person, courseId, stepId: step.id, expiresOn: input.expiresOn ?? null }) }
}

async function signOffEvidence(unit: UnitView, actor: Actor, e: { id: string, accountId: string, courseId: string, stepId: string, expiresOn: string | null }): Promise<string | null> {
  const course = await courseOrRefuse(e.courseId)
  const pending = addSignOff(unit, { accountId: e.accountId, courseId: e.courseId, stepId: e.stepId, kind: 'evidence', signedBy: actor.accountId ?? null, occurredOn: await theatreDay(nowMs()), evidenceId: e.id, evidenceExpiresOn: e.expiresOn })
  return evaluateAward(unit, course, e.accountId, [pending])
}

async function decide(unit: UnitView, actor: Actor, evidence: Evidence, { state, reason }: { state: 'verified' | 'rejected', reason: string | null }): Promise<void> {
  if (evidence.state !== 'submitted') refuse('training.evidence.decided', 'This evidence has already been dealt with.', { status: 409 })
  if (await samePerson(actor.accountId, evidence.accountId)) refuse('training.own-evidence', 'This is your own evidence. Somebody else must check it.', { status: 403 })
  const at = nowMs()
  unit.add({
    sql: 'UPDATE training_evidence SET state = ?, decided_by = ?, decided_at = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND state = \'submitted\'',
    params: [state, actor.accountId ?? null, at, reason, at, evidence.id],
  }).expect(1, { code: 'training.evidence.decided', reason: 'Someone else dealt with this evidence a moment ago.' })
  unit.announce('training.evidence.decided', { evidenceId: evidence.id, accountId: evidence.accountId, state }, { record: ['training.evidence', evidence.id] })
  unit.audit({ action: 'state', record: ['training.evidence', evidence.id], detail: { state } })
  const course = await courseOrRefuse(evidence.courseId)
  await notify(unit, 'training.evidence-decided', {
    to: evidence.accountId,
    variables: { course: course.title, outcome: state === 'verified' ? 'It has been checked and now counts towards the course.' : `It was not accepted: ${reason}` },
    dedupeKey: `evidence-decided:${evidence.id}`,
    subject: ['training.evidence', evidence.id],
  })
}

/** Verifies evidence (E1, E3): the sign-off and the award go in the same unit; evidence already expired is refused. */
export async function verifyEvidence(unit: UnitView, actor: Actor, evidenceId: string): Promise<{ recordId: string | null }> {
  const evidence = await evidenceOrRefuse(evidenceId)
  if (evidence.expiresOn && evidence.expiresOn < await theatreDay(nowMs())) refuse('training.evidence.expired', 'This has expired since it was sent, so it cannot count.', { status: 409, remedy: 'Reject it and ask for a current one.' })
  await evidenceStepOrRefuse(evidence.courseId, evidence.stepId)
  await decide(unit, actor, evidence, { state: 'verified', reason: null })
  return { recordId: await signOffEvidence(unit, actor, evidence) }
}

/** Rejects evidence with a reason the person sees (E6); they may send a new one. */
export async function rejectEvidence(unit: UnitView, actor: Actor, evidenceId: string, reason: string): Promise<void> {
  await decide(unit, actor, await evidenceOrRefuse(evidenceId), { state: 'rejected', reason })
}

/** The person takes back evidence still waiting. */
export async function withdrawEvidence(unit: UnitView, actor: Actor, evidenceId: string): Promise<void> {
  const evidence = await evidenceOrRefuse(evidenceId)
  if (!await samePerson(actor.accountId, evidence.accountId)) refuse('training.evidence.not-found', 'There is no such evidence.', { status: 404 })
  if (evidence.state !== 'submitted') refuse('training.evidence.decided', 'This evidence has already been dealt with.', { status: 409 })
  const at = nowMs()
  unit.add({ sql: 'UPDATE training_evidence SET state = \'withdrawn\', updated_at = ? WHERE id = ? AND state = \'submitted\'', params: [at, evidence.id] })
    .expect(1, { code: 'training.evidence.decided', reason: 'This evidence was dealt with a moment ago.' })
  unit.audit({ action: 'state', record: ['training.evidence', evidence.id], detail: { state: 'withdrawn' } })
}

export interface EvidenceView extends Evidence {
  course: string
  step: string
  /** A certificate naming a qualification the step does not list (E7). */
  notOnList: boolean
  /** Waiting longer than training.evidence.chase-after (E8). */
  overdue: boolean
  fileUrl: string | null
}

async function view(rows: Evidence[]): Promise<EvidenceView[]> {
  const chase = await useSetting('training.evidence.chase-after') as number * SECOND
  const at = nowMs()
  const out: EvidenceView[] = []
  for (const e of rows) {
    const step = await getStep(e.stepId)
    const course = await first<{ title: string }>('SELECT title FROM training_courses WHERE id = ?', e.courseId)
    const listed = step?.qualifications ?? []
    out.push({
      ...e,
      course: course?.title ?? '',
      step: step?.title ?? '',
      notOnList: e.kind === 'certificate' && !!e.qualification && listed.length > 0 && !listed.some(q => q.title === e.qualification),
      overdue: e.state === 'submitted' && at - e.createdAt > chase,
      fileUrl: e.fileId ? `/files/${e.fileId}` : null,
    })
  }
  return out
}

/** The queue (K9): evidence waiting, oldest first, on courses where the actor checks evidence. */
export async function evidenceQueue(actor: Actor, filter: { kind?: 'certificate' | 'declaration', courseId?: string } = {}): Promise<EvidenceView[]> {
  const rows = (await all<EvidenceRow>(`${EVIDENCE} WHERE state = 'submitted' AND (?1 IS NULL OR kind = ?1) AND (?2 IS NULL OR course_id = ?2) ORDER BY created_at, id`, filter.kind ?? null, filter.courseId ?? null)).map(row) // not-policy: bound parameters
  const allowed = new Map<string, boolean>()
  for (const courseId of new Set(rows.map(r => r.courseId))) allowed.set(courseId, (await can(actor, VERIFY, ['training.course', courseId])).allowed)
  return view(rows.filter(r => allowed.get(r.courseId)))
}

/** The person's own evidence, newest first, each with the last reason it was not accepted (E6). */
export async function myEvidence(accountId: string): Promise<EvidenceView[]> {
  return view((await all<EvidenceRow>(`${EVIDENCE} WHERE account_id IN (${accountScopeSql('?1')}) ORDER BY created_at DESC, id DESC`, accountId)).map(row))
}

/** One piece of evidence, for its subject or a verifier at its course; a verifier's opening is audited (E4). */
export async function evidenceFor(actor: Actor, evidenceId: string): Promise<EvidenceView> {
  const evidence = await evidenceOrRefuse(evidenceId)
  if (!await samePerson(actor.accountId, evidence.accountId)) {
    if (!(await can(actor, VERIFY, ['training.course', evidence.courseId])).allowed) refuse('training.evidence.not-found', 'There is no such evidence.', { status: 404 })
    await auditRead(evidence.id)
  }
  return (await view([evidence]))[0]!
}

/** Whether the actor may open an evidence file (E4): its subject, or a verifier at its course, whose opening is audited. */
export async function mayReadEvidenceFile(actor: Actor, evidenceId: string): Promise<boolean> {
  const evidence = await getEvidence(evidenceId)
  if (!evidence) return false
  if (await samePerson(actor.accountId, evidence.accountId)) return true
  if (!(await can(actor, VERIFY, ['training.course', evidence.courseId])).allowed) return false
  await auditRead(evidence.id)
  return true
}

async function auditRead(evidenceId: string): Promise<void> {
  const unit = createUnit()
  unit.audit({ action: 'read', record: ['training.evidence', evidenceId], ability: VERIFY })
  await unit.commit()
}
