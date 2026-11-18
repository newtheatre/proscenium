// Templates (FB-208): a new form starts from a shipped template or one the theatre saved, and is
// its own form from then on.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, author, definition, form, question, ready, req, save } from './stage'
import { reviewWorkflow } from '../../shared/engine'

const keeper = person(['forms.form.create', 'forms.form.edit', 'forms.template.manage'], { name: 'Kit Keeper', reassertedAt: Date.UTC(2026, 10, 17, 12) })
beforeAll(async () => {
  await ready()
  await account(keeper)
})
const draftOf = async (formId: string, actor = author) => (await req('GET', `/api/forms/forms/${formId}`, undefined, actor)).body.draft.definition

describe('templates', () => {
  it('lists the shipped templates, and a form started from one is a copy that remembers which', async () => {
    const list = await req('GET', '/api/forms/templates')
    expect(list.status).toBe(200)
    expect(list.body.canManage).toBe(false)
    expect(list.body.templates.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['forms.show-proposal', 'forms.access-requirements', 'forms.feedback-survey']))
    expect(list.body.templates.find((t: { key: string }) => t.key === 'forms.feedback-survey')).toMatchObject({ own: false, anonymous: true, questions: 4 })

    const made = await req('POST', '/api/forms/forms', { title: 'After the show', template: 'forms.feedback-survey' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const def = await draftOf(made.body.formId)
    expect(def.pages[0].items.map((i: { id: string }) => i.id)).toEqual(['overall', 'heard', 'again', 'comments'])
    expect((await rows('SELECT template_key, anonymous FROM forms_forms WHERE id = ?', made.body.formId))[0]).toEqual({ template_key: 'forms.feedback-survey', anonymous: 1 })
    // The proposal comes with its stages and its total.
    const proposal = await req('POST', '/api/forms/forms', { title: 'Spring proposals', template: 'forms.show-proposal' })
    const stages = await draftOf(proposal.body.formId)
    expect(stages.workflow.stages).toHaveLength(5)
    expect(stages.calculations[0].key).toBe('total')
    // A shipped template says how long it keeps answers, so it can be published as it comes; the builder is told what would stop it.
    expect((await rows('SELECT retention_days FROM forms_forms WHERE id = ?', proposal.body.formId))[0]).toEqual({ retention_days: 730 })
    const plan = await req('GET', `/api/forms/forms/${proposal.body.formId}/publish`)
    expect(plan.body.refusals).toEqual([])
    expect((await req('GET', `/api/forms/forms/${proposal.body.formId}`)).body).toMatchObject({ requireRetention: true, shared: false })
    expect((await req('POST', '/api/forms/forms', { title: 'Nothing', template: 'ftpl_nothing' })).body.code).toBe('forms.template.not-found')
  })

  it('saves a form as the theatre\'s own template, without the people it named, and starts new forms from it', async () => {
    const formId = await form('Workshop sign-up', keeper)
    const workflow = reviewWorkflow({ received: 'Received', review: 'In review', returned: 'Back', approved: 'Approved', declined: 'Declined', start: 'Start', back: 'Return', resubmit: 'Send', approve: 'Approve', decline: 'Decline' })
    workflow.stages[1]!.review = { mode: 'vote', reviewers: { role: 'administrator', people: [keeper.accountId!] }, pass: 'majority' }
    await save(formId, { ...definition(question('name'), question('why', { type: 'text.long' })), workflow }, keeper)

    // Not for somebody who cannot manage templates, nor from a form they cannot edit.
    expect((await req('POST', '/api/forms/templates', { name: 'Sign-up', formId })).status).toBe(403)
    const other = await form('Somebody else\'s')
    expect((await req('POST', '/api/forms/templates', { name: 'Theirs', formId: other }, person(['forms.template.manage'], { name: 'Tess Template' }))).status).toBe(403)
    expect((await req('POST', '/api/forms/templates', { name: 'Nothing' }, keeper)).body.code).toBe('forms.template.nothing')

    const saved = await req('POST', '/api/forms/templates', { name: 'Sign-up', description: 'For workshops', formId }, keeper)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const list = await req('GET', '/api/forms/templates', undefined, keeper)
    expect(list.body.canManage).toBe(true)
    expect(list.body.templates.at(-1)).toEqual({ key: saved.body.templateId, name: 'Sign-up', description: 'For workshops', own: true, anonymous: false, questions: 2 })

    // Changing the form afterwards changes nothing in the template.
    await save(formId, definition(question('name')), keeper)
    const made = await req('POST', '/api/forms/forms', { title: 'Summer workshop', template: saved.body.templateId }, keeper)
    const def = await draftOf(made.body.formId, keeper)
    expect(def.pages[0].items).toHaveLength(2)
    expect(def.workflow.stages[1].review.reviewers).toEqual({ role: 'administrator' })

    // Removed, it can be put back from what the reply carried; forms made from it stay.
    const gone = await req('DELETE', `/api/forms/templates/${saved.body.templateId}`, {}, keeper)
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)
    expect((await req('DELETE', `/api/forms/templates/${saved.body.templateId}`, {}, keeper)).status).toBe(404)
    expect((await req('GET', `/api/forms/forms/${made.body.formId}`, undefined, keeper)).status).toBe(200)
    const back = await req('POST', '/api/forms/templates', gone.body.removed, keeper)
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect((await req('GET', '/api/forms/templates', undefined, keeper)).body.templates.at(-1)).toMatchObject({ name: 'Sign-up', questions: 2 })
  })
})
