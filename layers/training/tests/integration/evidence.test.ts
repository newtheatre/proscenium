// Certificates and declarations (TR-21, TR-46 to TR-48, TR-52; E1 to E9, S4).
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, nowMs, type Actor } from '#kit'
import { inContext, rows } from '../../../../tests/integration/helpers'
import { OPEN, definition, question, req as formsReq } from '../../../forms/tests/integration/stage'
import { mayReadEvidenceFile } from '../../server/evidence'
import { DAY, MANAGER, liveCourse, ready, req, someone, training } from './stage'

beforeEach(ready)

const VERIFIER = [...MANAGER, 'training.evidence.verify']
const learner = (name?: string) => someone(['training.course.view'], name)
/** The same person, having signed in again after the clock moved on. */
const fresh = (actor: Actor): Actor => ({ ...actor, reassertedAt: nowMs() }) as Actor
const CERTIFICATE = { kind: 'certificate', title: 'First aid at work', evidenceExpiry: 'required', evidenceFile: 'optional' }
const LISTED = { ...CERTIFICATE, qualifications: [{ title: 'First Aid at Work', issuers: ['St John Ambulance', 'Red Cross'] }], otherQualification: false }
const DECLARATION = { kind: 'declaration', title: 'Experience elsewhere', evidenceFile: 'optional' }
const CERT = { issuer: 'St John Ambulance', issuedOn: '2026-01-10', expiresOn: '2029-01-10' }

async function selfSubmit(on: boolean): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'training.evidence.self-submit', on, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

async function stepOf(courseId: string): Promise<string> {
  const [step] = await rows<{ id: string }>('SELECT id FROM training_course_steps WHERE version_id = (SELECT live_version_id FROM training_courses WHERE id = ?) ORDER BY position', courseId)
  return step!.id
}

async function upload(actor: Actor, courseId: string, stepId: string, bytes = new Uint8Array([37, 80, 68, 70])): Promise<{ status: number, body: any }> {
  const response = await training(new Request(`http://test/api/training/courses/${courseId}/steps/${stepId}/evidence-file?name=cert.pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf', 'host': 'test', 'x-test-actor': JSON.stringify(actor) },
    body: bytes,
  }))
  return { status: response.status, body: await response.json() }
}

describe('certificates (TR-21; E1 to E4, S4)', () => {
  it('signs nothing off until a verifier other than its subject checks it, then signs off and awards in one unit', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const stepId = await stepOf(courseId)
    const person = await learner()
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(await rows('SELECT kind FROM training_sign_offs WHERE account_id = ?', person.accountId)).toEqual([])
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })).body.code).toBe('training.evidence.waiting')

    // A verifier who is its subject cannot check it.
    const selfChecker = await someone([...VERIFIER])
    const own = await req(selfChecker, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    expect((await req(selfChecker, 'POST', `/api/training/evidence/${own.body.evidenceId}/verify`, {})).body.code).toBe('training.own-evidence')

    const verified = await req(manager, 'POST', `/api/training/evidence/${sent.body.evidenceId}/verify`, {})
    expect(verified.status, JSON.stringify(verified.body)).toBe(200)
    expect(verified.body.recordId).toMatch(/^trec_/)
    expect(await rows('SELECT kind, evidence_id FROM training_sign_offs WHERE account_id = ?', person.accountId)).toEqual([{ kind: 'evidence', evidence_id: sent.body.evidenceId }])
    // The course's year, since the certificate runs longer (A3).
    const [record] = await rows<{ expires_at: number }>('SELECT expires_at FROM training_records WHERE id = ?', verified.body.recordId)
    expect(new Date(record!.expires_at).toISOString().slice(0, 10)).toBe('2027-11-24')
    expect((await req(manager, 'POST', `/api/training/evidence/${sent.body.evidenceId}/verify`, {})).body.code).toBe('training.evidence.decided')
  })

  it('asks for the issuer, the dates the step needs, and refuses one already expired', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const stepId = await stepOf(courseId)
    const person = await learner()
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, issuedOn: '2026-01-10' })).body.code).toBe('training.evidence.incomplete')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, expiresOn: null })).body.fields).toHaveProperty('expiresOn')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, expiresOn: '2026-11-01' })).body.code).toBe('training.evidence.expired')
  })

  it('refuses evidence that expired while it waited (E3)', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const person = await learner()
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId: await stepOf(courseId), ...CERT, expiresOn: '2026-11-30' })
    advanceClock(10 * DAY)
    expect((await req(fresh(manager), 'POST', `/api/training/evidence/${sent.body.evidenceId}/verify`, {})).body.code).toBe('training.evidence.expired')
  })

  it('rejects with a reason the person sees, and they may send again (E6); they may withdraw what waits', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const stepId = await stepOf(courseId)
    const person = await learner()
    const first = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    expect((await req(manager, 'POST', `/api/training/evidence/${first.body.evidenceId}/reject`, { reason: 'The photo is unreadable.' })).status).toBe(200)
    const second = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    expect(second.status).toBe(200)
    const mine = await req(person, 'GET', '/api/training/me/evidence')
    expect(mine.body.evidence.map((e: any) => [e.state, e.rejectReason])).toEqual([['submitted', null], ['rejected', 'The photo is unreadable.']])
    const other = await learner('Someone Else')
    expect((await req(other, 'POST', `/api/training/evidence/${second.body.evidenceId}/withdraw`, {})).body.code).toBe('training.evidence.not-found')
    expect((await req(person, 'POST', `/api/training/evidence/${second.body.evidenceId}/withdraw`, {})).status).toBe(200)
    expect(await rows('SELECT state FROM training_evidence WHERE id = ?', second.body.evidenceId)).toEqual([{ state: 'withdrawn' }])
  })

  it('a step that forbids files takes only a seen-only entry, made by a verifier (E2)', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [{ ...CERTIFICATE, title: 'Criminal record check', evidenceFile: 'forbidden' }])
    const stepId = await stepOf(courseId)
    const person = await learner()
    expect((await upload(person, courseId, stepId)).body.code).toBe('training.evidence-forbidden')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, reference: 'ABC123' })).body.code).toBe('training.evidence-forbidden')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence/seen`, { stepId, accountId: person.accountId, issuer: 'DBS', issuedOn: '2026-11-20', expiresOn: '2029-11-20' })).status).toBe(403)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/evidence/seen`, { stepId, accountId: manager.accountId, issuer: 'DBS', issuedOn: '2026-11-20', expiresOn: '2029-11-20' })).body.code).toBe('training.own-evidence')
    const saw = await req(manager, 'POST', `/api/training/courses/${courseId}/evidence/seen`, { stepId, accountId: person.accountId, issuer: 'DBS', issuedOn: '2026-11-20', expiresOn: '2029-11-20' })
    expect(saw.status, JSON.stringify(saw.body)).toBe(200)
    expect(saw.body.recordId).toMatch(/^trec_/)
    expect(await rows('SELECT seen_only, state, file_id, reference FROM training_evidence WHERE id = ?', saw.body.evidenceId)).toEqual([{ seen_only: 1, state: 'verified', file_id: null, reference: null }])
  })

  it('a file is checked before it is sent, kept with the evidence, and opened only by its subject and verifiers (E4)', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [{ ...CERTIFICATE, evidenceFile: 'required' }])
    const stepId = await stepOf(courseId)
    const person = await learner()
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })).body.code).toBe('training.evidence.file-required')
    const up = await upload(person, courseId, stepId)
    expect(up.status, JSON.stringify(up.body)).toBe(200)
    const sentEarly = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, evidenceId: up.body.evidenceId, fileId: up.body.fileId })
    expect(sentEarly.body.code).toBe('core.files.not-ready')
    await rows('UPDATE core_files SET state = \'ready\' WHERE id = ?', up.body.fileId)
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, evidenceId: up.body.evidenceId, fileId: up.body.fileId })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body.evidenceId).toBe(up.body.evidenceId)
    expect((await rows<{ attached_at: number | null }>('SELECT attached_at FROM core_files WHERE id = ?', up.body.fileId))[0]!.attached_at).not.toBeNull()

    const stranger = await learner('Not Them')
    expect(await inContext(() => mayReadEvidenceFile(person, sent.body.evidenceId))).toBe(true)
    expect(await inContext(() => mayReadEvidenceFile(stranger, sent.body.evidenceId))).toBe(false)
    expect(await inContext(() => mayReadEvidenceFile(manager, sent.body.evidenceId))).toBe(true)
    expect(await rows('SELECT action FROM core_audit WHERE record_type = \'training.evidence\' AND record_id = ? AND action = \'read\'', sent.body.evidenceId)).toHaveLength(1)
    expect((await req(stranger, 'GET', `/api/training/evidence/${sent.body.evidenceId}`)).status).toBe(404)
    expect((await req(manager, 'GET', `/api/training/evidence/${sent.body.evidenceId}`)).body.fileUrl).toBe(`/files/${up.body.fileId}`)
  })

  it('self-submit off leaves sending to a verifier, for the person', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const stepId = await stepOf(courseId)
    await selfSubmit(false)
    const person = await learner()
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })).body.code).toBe('training.evidence.self-submit-off')
    const other = await learner('Another Learner')
    expect((await req(other, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, accountId: person.accountId })).body.code).toBe('training.evidence.not-yours')
    const forThem = await req(manager, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, accountId: person.accountId })
    expect(forThem.status, JSON.stringify(forThem.body)).toBe(200)
    expect(await rows('SELECT account_id, submitted_by FROM training_evidence WHERE id = ?', forThem.body.evidenceId)).toEqual([{ account_id: person.accountId, submitted_by: manager.accountId }])
    await selfSubmit(true)
  })
})

describe('recognised qualifications (TR-48; E7)', () => {
  it('offers the list, refuses another unless the step allows it, and flags one not on the list for the verifier', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [LISTED])
    const stepId = await stepOf(courseId)
    const person = await learner()
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })).body.fields).toHaveProperty('qualification')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, qualification: 'Emergency First Aid' })).body.code).toBe('training.evidence.qualification-not-listed')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT, qualification: 'First Aid at Work' })).status).toBe(200)

    const open = await liveCourse(manager, [{ ...LISTED, otherQualification: true }])
    const other = await req(person, 'POST', `/api/training/courses/${open.courseId}/evidence`, { stepId: await stepOf(open.courseId), ...CERT, qualification: 'Emergency First Aid' })
    expect(other.status).toBe(200)
    const queue = await req(manager, 'GET', '/api/training/evidence')
    expect(queue.body.evidence.filter((e: any) => e.accountId === person.accountId).map((e: any) => [e.qualification, e.notOnList])).toEqual([['First Aid at Work', false], ['Emergency First Aid', true]])
  })
})

describe('declarations (TR-46, TR-47; E5, E9)', () => {
  it('needs a statement, signs nothing off until approved, and earns the course', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [DECLARATION])
    const stepId = await stepOf(courseId)
    const person = await learner()
    const missing = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId })
    expect(missing.body.fields, JSON.stringify(missing.body)).toHaveProperty('statement')
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, {
      stepId, statement: 'Ran the bar at the Edinburgh Fringe for three seasons.', organisation: 'Fringe venue', doneFrom: '2022-08-01', doneTo: '2024-08-31', referee: 'Bar manager, bar@example.org',
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(await rows('SELECT kind FROM training_sign_offs WHERE account_id = ?', person.accountId)).toEqual([])
    const approved = await req(manager, 'POST', `/api/training/evidence/${sent.body.evidenceId}/verify`, {})
    expect(approved.body.recordId).toMatch(/^trec_/)
    // No expiry of its own: the record runs for the course's validity (E9).
    const [record] = await rows<{ expires_at: number }>('SELECT expires_at FROM training_records WHERE id = ?', approved.body.recordId)
    expect(new Date(record!.expires_at).toISOString().slice(0, 10)).toBe('2027-11-24')
  })

  it('stores the step\'s questions through Forms in the same unit, against the version pinned at publishing (E5, V9)', async () => {
    const manager = await someone([...VERIFIER, 'forms.form.create', 'forms.form.edit', 'forms.form.publish'])
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Bar supervisor', expires: false })
    const courseId = made.body.courseId
    const formId = (await formsReq('POST', '/api/forms/forms', { title: 'Bar experience' }, manager as any)).body.formId as string
    expect((await formsReq('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, manager as any)).status).toBe(200)
    const { body } = await formsReq('GET', `/api/forms/forms/${formId}`, undefined, manager as any)
    const draft = await formsReq('PUT', `/api/forms/forms/${formId}/draft`, { definition: definition(question('venues', { type: 'text.short', required: true })), editRevision: body.draft.editRevision }, manager as any)
    expect(draft.status, JSON.stringify(draft.body)).toBe(200)
    expect((await formsReq('POST', `/api/forms/forms/${formId}/publish`, { editRevision: draft.body.editRevision }, manager as any)).status).toBe(200)
    const form = { body: { formId } }
    const saved = await req(manager, 'PUT', `/api/training/courses/${courseId}/steps`, { steps: [{ ...DECLARATION, formId: form.body.formId }] })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, {})).body.code).toBe('training.declaration.form-unavailable')
    const attached = await formsReq('PUT', `/api/forms/slots/training.declaration/${courseId}/${formId}`, { ...OPEN, audience: 'signed_in' }, manager as any)
    expect(attached.status, JSON.stringify(attached.body)).toBe(200)
    const published = await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, {})
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    const [step] = await rows<{ id: string, form_version_id: string | null }>('SELECT id, form_version_id FROM training_course_steps WHERE version_id = (SELECT live_version_id FROM training_courses WHERE id = ?)', courseId)
    expect(step!.form_version_id).toMatch(/^fver_/)

    const person = await learner()
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId: step!.id, statement: 'Three years behind a bar.' })).body.fields).toHaveProperty('answers')
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId: step!.id, statement: 'Three years behind a bar.', answers: { venues: 'The Grand' } })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const [evidence] = await rows<{ response_id: string }>('SELECT response_id FROM training_evidence WHERE id = ?', sent.body.evidenceId)
    expect(evidence!.response_id).toMatch(/^fres_/)
  })
})

describe('the queue (TR-47, TR-52; E8)', () => {
  it('lists waiting evidence oldest first for verifiers only, and marks what has waited past chase-after', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const stepId = await stepOf(courseId)
    const a = await learner('First Sender')
    const b = await learner('Second Sender')
    await req(a, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    advanceClock(8 * DAY)
    await req(b, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId, ...CERT })
    const queue = await req(fresh(manager), 'GET', `/api/training/evidence?courseId=${courseId}`)
    expect(queue.body.evidence.map((e: any) => [e.accountId, e.overdue])).toEqual([[a.accountId, true], [b.accountId, false]])
    expect((await req(a, 'GET', '/api/training/evidence')).body.evidence).toEqual([])
  })
})

describe('evidence expiry (A3, E3)', () => {
  it('brings the record forward to a certificate that expires first', async () => {
    const manager = await someone(VERIFIER)
    const { courseId } = await liveCourse(manager, [CERTIFICATE])
    const person = await learner()
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId: await stepOf(courseId), ...CERT, expiresOn: '2027-03-01' })
    const verified = await req(manager, 'POST', `/api/training/evidence/${sent.body.evidenceId}/verify`, {})
    const [record] = await rows<{ expires_at: number }>('SELECT expires_at FROM training_records WHERE id = ?', verified.body.recordId)
    expect(new Date(record!.expires_at).toISOString().slice(0, 10)).toBe('2027-03-01')
  })
})
