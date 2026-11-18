// A form's life after publishing: paused and closed forms take no new responses, a form is
// archived only once it is closed and nothing is waiting on anybody, and each step can be undone.
import { beforeAll, describe, expect, it } from 'vitest'
import { person } from '../../../../tests/integration/helpers'
import { account, definition, form, offered, question, ready, req, send } from './stage'
import { reviewWorkflow } from '../../shared/engine'

const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const member = person([], { name: 'Mo Member' })
beforeAll(async () => {
  await ready()
  for (const who of [decider, member]) await account(who)
})
const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
const to = (formId: string, status: string, actor = undefined as ReturnType<typeof person> | undefined) => req('POST', `/api/forms/forms/${formId}/status`, { to: status }, actor)
const state = async (slug: string) => (await req('GET', `/api/forms/open/${slug}`, undefined, member)).body.state

describe('a form after it is published', () => {
  it('is paused and resumed, closed and opened again, and takes responses only while live', async () => {
    const { formId, slug } = await offered(definition(question('name')))
    expect((await to(formId, 'paused', member)).status).toBe(403)
    expect((await to(formId, 'archived')).body.code).toBe('forms.form.status')
    expect((await to(formId, 'paused')).body).toEqual({ status: 'paused' })
    expect(await state(slug)).toBe('paused')
    expect((await send(slug, { name: 'Mo' }, member)).status).toBe(409)
    expect((await to(formId, 'live')).status).toBe(200)
    expect((await send(slug, { name: 'Mo' }, member)).status).toBe(200)
    expect((await to(formId, 'closed')).status).toBe(200)
    expect(await state(slug)).toBe('closed')
    expect((await send(slug, { name: 'Mo' }, member)).body.code).toBe('forms.link.closed')
    expect((await to(formId, 'live')).status).toBe(200)
    expect(await state(slug)).toBe('open')
  })

  it('is archived only when closed with nothing waiting, is then gone from its address and cannot be edited, and comes back closed', async () => {
    const { formId, slug } = await offered({ ...definition(question('name')), workflow: reviewWorkflow(names) })
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    await to(formId, 'closed')
    expect((await to(formId, 'archived')).body).toMatchObject({ code: 'forms.form.responses-waiting', reason: 'One response is still waiting on somebody.' })
    // Staff carry on with what a closed form has.
    for (const move of ['start_review', 'approve']) expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/move`, { move }, decider)).status).toBe(200)
    expect((await to(formId, 'archived')).body).toEqual({ status: 'archived' })
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, member)).status).toBe(404)
    const got = await req('GET', `/api/forms/forms/${formId}`)
    expect(got.body.form).toMatchObject({ status: 'archived' })
    expect(got.body.form.archivedAt).not.toBeNull()
    expect((await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: definition(question('name')), editRevision: got.body.draft.editRevision })).body.code).toBe('forms.form.archived')
    expect((await to(formId, 'draft')).status).toBe(409)
    expect((await to(formId, 'closed')).status).toBe(200)
    expect((await req('GET', `/api/forms/forms/${formId}`)).body.form).toMatchObject({ status: 'closed', archivedAt: null })
  })

  it('can be archived before it is ever published, and comes back a draft', async () => {
    const formId = await form()
    expect((await to(formId, 'closed')).status).toBe(409)
    expect((await to(formId, 'archived')).status).toBe(200)
    expect((await to(formId, 'closed')).status).toBe(409)
    expect((await to(formId, 'draft')).body).toEqual({ status: 'draft' })
  })
})
