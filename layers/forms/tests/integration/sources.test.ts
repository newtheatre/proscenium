// Sources (forms.source): a "record from a source" question keeps the ids of what was chosen and
// their names as they read then, refuses an id its source does not know, opens a source only to
// somebody it allows, and bars anybody named as involved from reviewing the response.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, definition, form, offered, publish, question, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'

const chair = person(['forms.response.decide'], { name: 'Cy Chair' })
const searcher = person(['core.account.search'], { name: 'Sal Searcher' })
const ann = person([], { name: 'Ann Panel' })
const ben = person([], { name: 'Ben Panel' })
const member = person([], { name: 'Mo Member' })

beforeAll(async () => {
  await ready()
  for (const who of [chair, searcher, ann, ben, member]) await account(who)
})

const names = { received: 'Received', review: 'With the panel', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
const nominee = (more: Record<string, unknown> = {}) => question('nominee', { type: 'record', source: 'core.person', dataClass: 'personal', ...more })

describe('a record from a source', () => {
  it('is stored as the id chosen, with its name as it read when the response was sent', async () => {
    const { formId, slug } = await offered(definition(nominee(), question('others', { type: 'record', source: 'core.person', multiple: true, dataClass: 'personal' })))
    const sent = await send(slug, { nominee: ann.accountId, others: [ben.accountId, ann.accountId] }, member)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const stored = await rows<any>('SELECT question_id, value_text, value_json, label_snapshot FROM forms_answers WHERE response_id = ? ORDER BY question_id', sent.body.responseId)
    expect(stored).toEqual([
      { question_id: 'nominee', value_text: ann.accountId, value_json: null, label_snapshot: 'Ann Panel' },
      { question_id: 'others', value_text: null, value_json: JSON.stringify([ben.accountId, ann.accountId]), label_snapshot: 'Ben Panel; Ann Panel' },
    ])
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, person(['forms.response.read'], { name: 'Rae Reader' }))
    expect(table.body.rows[0].cells.nominee.text).toBe('Ann Panel')
  })

  it('refuses an id its source does not know, beside the answer', async () => {
    const { slug } = await offered(definition(nominee()))
    const sent = await send(slug, { nominee: 'acc_nobodyatall' }, member)
    expect(sent.status).toBe(422)
    expect(sent.body.fields).toEqual({ nominee: 'forms.issues.record' })
  })

  it('cannot be published on a source that no module offers', async () => {
    const formId = await form()
    await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 })
    const published = await publish(formId, definition(question('thing', { type: 'record', source: 'nowhere.thing' })))
    expect(published.status).toBe(422)
    expect(published.body.code).toBe('forms.publish.problems')
    const plan = await req('GET', `/api/forms/forms/${formId}/publish`)
    expect(JSON.stringify(plan.body)).toContain('unknown-source')
  })

  it('opens a source only to somebody it allows, and says so to anybody else', async () => {
    const shut = await req('GET', `/api/forms/sources/core.person?ids=${ann.accountId}`, undefined, member)
    expect(shut.body).toEqual({ allowed: false, results: [], labels: {} })
    expect((await req('GET', `/api/forms/sources/core.person?ids=${ann.accountId}`, undefined, null)).body.allowed).toBe(false)
    const open = await req('GET', `/api/forms/sources/core.person?ids=${ann.accountId},acc_nobodyatall`, undefined, searcher)
    expect(open.body).toMatchObject({ allowed: true, labels: { [ann.accountId!]: 'Ann Panel' } })
    expect((await req('GET', '/api/forms/sources/core.venue?q=zz', undefined, null)).body).toEqual({ allowed: true, results: [], labels: {} })
    expect((await req('GET', '/api/forms/sources/nowhere.thing', undefined, searcher)).status).toBe(404)
  })

  it('lists the sources for the builder', async () => {
    const formId = await form()
    const { body } = await req('GET', `/api/forms/forms/${formId}`)
    expect(body.sources.map((s: any) => s.key).sort()).toEqual(['core.performance', 'core.person', 'core.production', 'core.space', 'core.venue'])
    expect(body.sources.find((s: any) => s.key === 'core.person')).toMatchObject({ people: true, label: 'forms.sources.core.person' })
  })
})

describe('people involved', () => {
  it('bars a reviewer named in the answer from the response, without anybody declaring it', async () => {
    const workflow = reviewWorkflow(names)
    workflow.stages[1]!.review = { mode: 'vote', reviewers: { people: [ann.accountId!, ben.accountId!] }, pass: 'majority', quorum: 1 }
    const def: Definition = { ...definition(nominee({ peopleInvolved: true })), workflow }
    const { formId, slug } = await offered(def)
    const { responseId } = (await send(slug, { nominee: ann.accountId }, member)).body
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/move`, { move: 'start_review' }, chair)).status).toBe(200)
    const assigned = await rows<any>('SELECT reviewer_id, status, conflict FROM forms_review_assignments WHERE response_id = ? ORDER BY reviewer_id', responseId)
    expect(assigned.find(a => a.reviewer_id === ann.accountId)).toMatchObject({ status: 'conflicted', conflict: 'automatic' })
    expect(assigned.find(a => a.reviewer_id === ben.accountId)).toMatchObject({ status: 'assigned', conflict: null })
    expect((await req('GET', '/api/forms/reviews', undefined, ann)).body.reviews).toEqual([])
    // Somebody named who looks after the form cannot move or decide the response either, reviewer or not.
    const own = (await send(slug, { nominee: chair.accountId }, member)).body.responseId
    const refused = await req('POST', `/api/forms/forms/${formId}/responses/${own}/move`, { move: 'start_review' }, chair)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('forms.review.conflicted')
  })
})
