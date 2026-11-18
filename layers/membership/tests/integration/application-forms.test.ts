// Application forms (MEM-03, MEM-12, MEM-16): a form attached to a scheme in the slot
// membership.application is answered when joining and kept with the application. A scheme that
// approves opens only once its form can approve, waits for the form's decision, and becomes a
// membership when the response is approved, or is declined with it.
import { beforeAll, describe, expect, it } from 'vitest'
import { deliver, person, rows, setModule } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, publish, question, ready as formsReady, req as forms } from '../../../forms/tests/integration/stage'
import { reviewWorkflow, type Definition } from '../../../forms/shared/engine'
import { applicant, officer, ready, req, scheme } from './stage'

const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const names = { received: 'Received', review: 'With the committee', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }

beforeAll(async () => {
  await formsReady()
  await ready()
  await setModule('forms', true)
  await account(decider)
})

const questions = () => definition(question('why', { type: 'text.long', required: true, dataClass: 'free-text' }))
async function attached(schemeId: string, def: Definition): Promise<string> {
  const formId = await form('Why join?')
  expect((await forms('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 })).status).toBe(200)
  const done = await publish(formId, def)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  const put = await forms('PUT', `/api/forms/slots/membership.application/${schemeId}/${formId}`, { ...OPEN, audience: 'signed_in' }, officer)
  expect(put.status, JSON.stringify(put.body)).toBe(200)
  return formId
}
const open = (id: string) => req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
const move = (formId: string, id: string, key: string) => forms('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key }, decider)
const membership = async (id: string) => (await rows<any>('SELECT state, needs_approval, approved_at, response_id FROM membership_memberships WHERE id = ?', id))[0]

describe('a scheme with an application form', () => {
  it('asks the form when joining and keeps the answers with the membership', async () => {
    const id = await scheme()
    const formId = await attached(id, questions())
    expect((await open(id)).status).toBe(200)
    const ada = await applicant('Ada Answer')
    expect((await req('GET', '/api/membership/schemes', undefined, ada)).body.schemes.find((s: any) => s.id === id)).toMatchObject({ applicationForm: true })
    expect((await req('GET', `/api/membership/schemes/${id}/form`, undefined, ada)).body.form).toMatchObject({ formId, state: 'open', title: 'Why join?' })
    // Without the answers, or with answers the form refuses, nothing is written.
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)).body.code).toBe('membership.join.form-needed')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: {} } }, ada)).status).toBe(422)
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: { why: 'To build sets.' } } }, ada)
    expect(joined.body, JSON.stringify(joined.body)).toMatchObject({ pending: false })
    const row = await membership(joined.body.membershipId)
    expect(row).toMatchObject({ state: 'active', needs_approval: 0 })
    expect(row.response_id).toMatch(/^fres_/)
    expect((await req('GET', `/api/membership/memberships/${joined.body.membershipId}`)).body.membership).toMatchObject({ responseId: row.response_id, awaitingApproval: false })
  })
})

describe('a scheme that approves', () => {
  it('opens only once its application form can approve', async () => {
    const id = await scheme({ needsApproval: true })
    await attached(id, questions())
    expect((await open(id)).body.code).toBe('membership.scheme.needs-application-form')
    const other = await scheme({ needsApproval: true })
    await attached(other, { ...questions(), workflow: reviewWorkflow(names) })
    expect((await req('GET', `/api/membership/schemes/${other}`)).body.checklist).toContainEqual({ code: 'application-form', done: true })
    expect((await open(other)).status).toBe(200)
  })

  it('refuses to start approving an open scheme with no form that can approve', async () => {
    const id = await scheme()
    expect((await open(id)).status).toBe(200)
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { needsApproval: true })).body.code).toBe('membership.scheme.needs-application-form')
  })

  it('waits for the form\'s decision and becomes a membership when the response is approved', async () => {
    const id = await scheme({ needsApproval: true })
    const formId = await attached(id, { ...questions(), workflow: reviewWorkflow(names) })
    expect((await open(id)).status).toBe(200)
    const bo = await applicant('Bo Approved')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: { why: 'I run the lighting desk.' } } }, bo)
    expect(joined.body, JSON.stringify(joined.body)).toMatchObject({ pending: true, waiting: 'approval' })
    expect((await req('GET', '/api/membership/mine', undefined, bo)).body.applications).toMatchObject([{ id: joined.body.membershipId, waiting: 'approval' }])
    const { response_id: responseId } = await membership(joined.body.membershipId)
    expect((await move(formId, responseId, 'start_review')).status).toBe(200)
    expect((await move(formId, responseId, 'approve')).status).toBe(200)
    await deliver()
    expect(await membership(joined.body.membershipId)).toMatchObject({ state: 'active' })
    expect((await req('GET', '/api/membership/mine', undefined, bo)).body).toMatchObject({ applications: [], memberships: [{ schemeId: id, status: 'current' }] })
  })

  it('is declined when the response is declined, and the person may apply again', async () => {
    const id = await scheme({ needsApproval: true })
    const formId = await attached(id, { ...questions(), workflow: reviewWorkflow(names) })
    expect((await open(id)).status).toBe(200)
    const cy = await applicant('Cy Declined')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: { why: 'Just because.' } } }, cy)
    const { response_id: responseId } = await membership(joined.body.membershipId)
    await move(formId, responseId, 'start_review')
    expect((await move(formId, responseId, 'decline')).status).toBe(200)
    await deliver()
    expect(await membership(joined.body.membershipId)).toMatchObject({ state: 'declined' })
    const again = await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: { why: 'Please.' } } }, cy)
    expect(again.body.membershipId).not.toBe(joined.body.membershipId)
  })

  it('waits for staff\'s check and the form\'s decision both', async () => {
    const id = await scheme({ needsApproval: true })
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
    const formId = await attached(id, { ...questions(), workflow: reviewWorkflow(names) })
    expect((await open(id)).status).toBe(200)
    const di = await applicant('Di Both')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { form: { formId, answers: { why: 'Front of house.' } } }, di)
    expect(joined.body).toMatchObject({ pending: true, waiting: 'staff-check' })
    expect((await req('POST', `/api/membership/applications/${joined.body.membershipId}/decide`, { outcome: 'pass' })).body).toEqual({ state: 'pending', waiting: 'approval' })
    const { response_id: responseId } = await membership(joined.body.membershipId)
    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'approve')
    await deliver()
    expect(await membership(joined.body.membershipId)).toMatchObject({ state: 'active' })
  })
})
