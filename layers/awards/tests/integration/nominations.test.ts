// Nominations: a published form is attached to an award type in the slot awards.nomination, somebody
// nominates a person there, and approving the nomination issues the award once, with the citation
// and the decision, to the person named. It refuses a nominee who already holds a once-only award.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import { deliver, inContext, person, rows, sent, setModule } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, publish, question, ready as formsReady, req as forms } from '../../../forms/tests/integration/stage'
import { reviewWorkflow } from '../../../forms/shared/engine'
import { awardType, issue, NOV_17, ready, req } from './stage'

const registrar = person(['awards.type.manage'], { name: 'Reg Registrar', reassertedAt: NOV_17 })
const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const member = person([], { name: 'Mo Member' })
const nominee = person([], { name: 'Nell Nominee' })

beforeAll(async () => {
  await formsReady()
  await ready()
  await setModule('forms', true)
  for (const who of [registrar, decider, member, nominee]) await account(who)
  // A job builds the link in the recipient's message from the recorded address.
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

const names = { received: 'Received', review: 'With the committee', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function nomination() {
  const workflow = reviewWorkflow(names)
  workflow.transitions.find(t => t.key === 'approve')!.actions = [{ id: 'action_1', action: 'awards.issue-award', map: { nominee: 'nominee', citation: 'why', awardedFor: 'for' } }]
  return { ...definition(question('nominee', { type: 'record', source: 'core.person', dataClass: 'personal', required: true }), question('for'), question('why', { type: 'text.long' })), workflow }
}
async function attached(typeId: string) {
  const formId = await form('Nominate somebody')
  expect((await forms('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 })).status).toBe(200)
  const done = await publish(formId, nomination())
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  const slug = (await forms('GET', `/api/forms/forms/${formId}`)).body.form.slug as string
  const put = await forms('PUT', `/api/forms/slots/awards.nomination/${typeId}/${formId}`, { ...OPEN, audience: 'signed_in' }, registrar)
  expect(put.status, JSON.stringify(put.body)).toBe(200)
  return { formId, slug, placementId: put.body.placementId as string }
}
async function nominated(at: { formId: string, slug: string, placementId: string }, who: string) {
  const made = await forms('POST', `/api/forms/open/${at.slug}/responses?place=${at.placementId}`, { responseId: newId('fres'), answers: { nominee: who, for: 'Twenty years backstage', why: 'Always the last to leave.' } }, member)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.responseId as string
}
const move = (formId: string, id: string, key: string) => forms('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key }, decider)
const runs = (id: string) => rows<any>('SELECT state, action_key FROM forms_action_runs WHERE response_id = ?', id)

describe('nominations', () => {
  it('offers the slot to whoever manages award types, and the action to a form\'s designer', async () => {
    const type = await awardType({ name: 'Fellowship of the house' })
    expect((await forms('GET', `/api/forms/slots/awards.nomination/${type}`, undefined, member)).status).toBe(403)
    const there = await forms('GET', `/api/forms/slots/awards.nomination/${type}`, undefined, registrar)
    expect(there.body).toMatchObject({ slot: { id: 'awards.nomination', limit: 1 }, attached: [] })
    const formId = await form()
    expect((await forms('GET', `/api/forms/forms/${formId}`)).body.actions).toContainEqual(expect.objectContaining({ key: 'awards.issue-award', slot: 'awards.nomination' }))
    expect((await req('GET', `/api/awards/types/${type}`)).body.nominations).toBe(true)
  })

  it('issues the award once when a nomination is approved, with the citation and the decision', async () => {
    const type = await awardType({ name: 'Commendation of the year' })
    const at = await attached(type)
    const open = await forms('GET', `/api/forms/open/${at.slug}?place=${at.placementId}`, undefined, member)
    expect(open.body.about).toMatchObject({ slot: 'awards.nomination', name: 'Commendation of the year' })
    const responseId = await nominated(at, nominee.accountId!)
    sent.length = 0
    await move(at.formId, responseId, 'start_review')
    expect((await move(at.formId, responseId, 'approve')).status).toBe(200)
    const jobs = [...sent]
    await deliver()
    expect(await runs(responseId)).toEqual([{ state: 'done', action_key: 'awards.issue-award' }])
    const awards = await rows<any>('SELECT account_id, recipient_name, awarded_on, awarded_for, citation, decided_on, source, response_id, issued_by, state FROM awards_awards WHERE type_id = ?', type)
    expect(awards).toEqual([{ account_id: nominee.accountId, recipient_name: 'Nell Nominee', awarded_on: '2026-11-17', awarded_for: 'Twenty years backstage', citation: 'Always the last to leave.', decided_on: '2026-11-17', source: 'nomination', response_id: responseId, issued_by: decider.accountId, state: 'current' }])
    expect((await req('GET', '/api/awards/mine', undefined, nominee)).body.awards).toHaveLength(1)
    // The same job delivered again issues nothing more.
    sent.push(...jobs)
    await deliver()
    expect(await rows('SELECT 1 FROM awards_awards WHERE type_id = ?', type)).toHaveLength(1)
  })

  it('leaves the run waiting when the nominee already holds a once-only award', async () => {
    const type = await awardType()
    await issue(type, { accountId: nominee.accountId })
    const at = await attached(type)
    const responseId = await nominated(at, nominee.accountId!)
    await move(at.formId, responseId, 'start_review')
    await move(at.formId, responseId, 'approve')
    await deliver()
    expect(await runs(responseId)).toEqual([{ state: 'waiting', action_key: 'awards.issue-award' }])
    expect(await rows('SELECT 1 FROM awards_awards WHERE type_id = ?', type)).toHaveLength(1)
  })

  it('offers the open nomination form to a member, and says so on the roll and My awards', async () => {
    const type = await awardType()
    const at = await attached(type)
    const open = await forms('GET', '/api/forms/slots/awards.nomination/open', undefined, member)
    expect(open.status).toBe(200)
    expect(open.body.open).toEqual(expect.arrayContaining([expect.objectContaining({ subjectId: type, formId: at.formId })]))
    expect((await req('GET', '/api/awards/mine', undefined, member)).body.nominations).toBe(true)
  })
})
