// Custom fields (FB-503): a form in record mode is attached to a slot for every record of its
// type and filled in on each record, one response per record, each save a new revision.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, publish, question, ready, req } from './stage'
import { reviewWorkflow } from '../../shared/engine'

const SLOT = 'gallery.show-fields'
const keeper = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'gallery.sample.manage', 'gallery.sample.view'], { name: 'Kit Keeper', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const editor = person(['gallery.sample.view'], { name: 'Ed Editor' })
const second = person(['gallery.sample.view'], { name: 'Sol Second' })
const stranger = person([], { name: 'Sam Stranger' })
beforeAll(async () => {
  await ready()
  for (const who of [keeper, editor, second, stranger]) await account(who)
})
const fieldsForm = async (title: string, def = definition(question('director'), question('running-time', { type: 'number', required: true }))) => {
  const made = await req('POST', '/api/forms/forms', { title, mode: 'record' }, keeper)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return { formId: made.body.formId as string, def }
}
const attach = (formId: string, subject = '*', actor = keeper) => req('PUT', `/api/forms/slots/${SLOT}/${subject}/${formId}`, OPEN, actor)
const fields = (record: string, actor = editor) => req('GET', `/api/forms/records/${SLOT}/${record}`, undefined, actor)
const saveTo = (record: string, formId: string, answers: Record<string, unknown>, revision: number, actor = editor) => req('PUT', `/api/forms/records/${SLOT}/${record}/${formId}`, { answers, revision }, actor)

describe('custom fields on a record', () => {
  it('are published without a retention period or a link, never with stages or special-category questions', async () => {
    const { formId } = await fieldsForm('Show details')
    const staged = await publish(formId, { ...definition(question('director', { dataClass: 'personal' }), question('needs', { dataClass: 'special' })), workflow: reviewWorkflow({ received: 'Received', review: 'In review', returned: 'Back', approved: 'Approved', declined: 'Declined', start: 'Start', back: 'Return', resubmit: 'Send', approve: 'Approve', decline: 'Decline' }) })
    expect(staged.status).toBe(422)
    const plan = await req('GET', `/api/forms/forms/${formId}/publish`)
    expect(plan.body.refusals.map((r: { code: string }) => r.code).sort()).toEqual(['forms.publish.record-special', 'forms.publish.record-stages'])
    // Personal answers need no retention period here: they go when the record does.
    expect((await publish(formId, definition(question('director', { dataClass: 'personal' })))).status).toBe(200)
    expect((await req('PUT', `/api/forms/forms/${formId}/link`, OPEN)).body.code).toBe('forms.link.record')
  })

  it('are attached for every record at once, by mode, and filled in on each record with revisions', async () => {
    const { formId, def } = await fieldsForm('Programme notes')
    expect((await publish(formId, def)).status).toBe(200)
    // A form people send does not go in a custom-fields slot, nor custom fields on one record or in a slot for sent forms.
    const sentForm = await form('A sent form', keeper)
    expect((await publish(sentForm, definition(question('name')))).status).toBe(200)
    expect((await attach(sentForm)).body.code).toBe('forms.slot.wrong-mode')
    expect((await attach(formId, 'prod-1')).status).toBe(404)
    expect((await req('PUT', `/api/forms/slots/gallery.show-feedback/prod-1/${formId}`, OPEN, keeper)).body.code).toBe('forms.slot.wrong-mode')
    expect((await attach(formId, '*', editor)).status).toBe(403)
    expect((await attach(formId)).status).toBe(200)
    const there = await req('GET', `/api/forms/slots/${SLOT}/*`, undefined, keeper)
    expect(there.body.slot.mode).toBe('record')
    expect(there.body.attached.map((a: { formId: string }) => a.formId)).toContain(formId)

    // Nothing is kept until the first save; then each record has its own answers.
    expect((await fields('prod-1', stranger)).status).toBe(403)
    const empty = await fields('prod-1')
    const set = empty.body.sets.find((s: { formId: string }) => s.formId === formId)
    expect(set).toMatchObject({ title: 'Programme notes', revision: 0, answers: {}, updatedAt: null })
    expect((await saveTo('prod-1', formId, { director: 'Ana' }, 0)).status).toBe(422)
    expect((await saveTo('prod-1', formId, { 'director': 'Ana', 'running-time': 140 }, 0)).body).toEqual({ revision: 1 })
    expect((await saveTo('prod-2', formId, { 'director': 'Ben', 'running-time': 95 }, 0, second)).body).toEqual({ revision: 1 })

    // A save made from an older revision is refused; the next one is a new revision beside the first.
    expect((await saveTo('prod-1', formId, { 'director': 'Zed', 'running-time': 1 }, 0, second)).body.code).toBe('forms.record.stale')
    expect((await saveTo('prod-1', formId, { 'director': 'Ana Ng', 'running-time': 150 }, 1, second)).body).toEqual({ revision: 2 })
    const now = (await fields('prod-1')).body.sets.find((s: { formId: string }) => s.formId === formId)
    expect(now).toMatchObject({ revision: 2, answers: { 'director': 'Ana Ng', 'running-time': 150 } })
    expect((await fields('prod-2')).body.sets.find((s: { formId: string }) => s.formId === formId).answers).toEqual({ 'director': 'Ben', 'running-time': 95 })

    const kept = await rows<any>('SELECT subject_type, subject_id, state, stage_kind, current_revision, person_id, entered_by, retention_due_at FROM forms_responses WHERE form_id = ? ORDER BY subject_id', formId)
    expect(kept).toEqual([
      { subject_type: 'gallery.production', subject_id: 'prod-1', state: 'submitted', stage_kind: 'closed', current_revision: 2, person_id: null, entered_by: second.accountId, retention_due_at: null },
      { subject_type: 'gallery.production', subject_id: 'prod-2', state: 'submitted', stage_kind: 'closed', current_revision: 1, person_id: null, entered_by: second.accountId, retention_due_at: null },
    ])
    expect((await rows<any>('SELECT count(*) AS n FROM forms_answers a JOIN forms_responses r ON r.id = a.response_id WHERE r.form_id = ? AND r.subject_id = ?', formId, 'prod-1'))[0].n).toBe(4)

    // A new version of the fields keeps what was answered to the questions it still has.
    expect((await publish(formId, definition(question('director'), question('running-time', { type: 'number' }), question('interval', { type: 'yesno' })), { confirm: true })).status).toBe(200)
    const later = (await fields('prod-1')).body.sets.find((s: { formId: string }) => s.formId === formId)
    expect(later).toMatchObject({ version: 2, revision: 2, answers: { 'director': 'Ana Ng', 'running-time': 150 } })
    expect((await saveTo('prod-1', formId, { ...later.answers, interval: true }, 2)).body).toEqual({ revision: 3 })

    // Taken away, the fields are gone from every record; what was kept stays in the responses.
    expect((await req('DELETE', `/api/forms/slots/${SLOT}/*/${formId}`, {}, keeper)).status).toBe(200)
    expect((await fields('prod-1')).body.sets.find((s: { formId: string }) => s.formId === formId)).toBeUndefined()
    expect((await saveTo('prod-1', formId, {}, 3)).status).toBe(404)
  })
})
