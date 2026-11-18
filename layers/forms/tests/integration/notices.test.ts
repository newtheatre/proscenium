// What forms tells people: a receipt when a response is sent, word when staff move it and it
// changes what the person is told, and a request to each reviewer who is to review. An anonymous
// form tells nobody; somebody signed out is told at the address they gave.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, nowMs } from '#kit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { sweepRetention } from '../../server/retention'
import { account, definition, offered, question, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'

const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const member = person([], { name: 'Mo Member' })
const reviewer = person([], { name: 'Rui Reviewer' })

beforeAll(async () => {
  await ready()
  for (const who of [decider, member, reviewer]) await account(who)
})

const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function staged(reviewers?: string[]): Definition {
  const workflow = reviewWorkflow(names)
  if (reviewers) workflow.stages.find(s => s.kind === 'in_review')!.review = { mode: 'vote', reviewers: { people: reviewers } }
  return { ...definition(question('name', { required: true })), workflow }
}
const told = async (responseId: string) => rows<{ type: string, account: string | null, address: string | null, payload: string }>('SELECT type_key AS type, account_id AS account, address, payload FROM core_notifications WHERE subject_id = ? ORDER BY created_at, id', responseId)
const move = (formId: string, id: string, key: string) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key }, decider)

describe('telling people', () => {
  it('sends a receipt to the account, and then word of each move staff make that changes what they are told', async () => {
    const { formId, slug } = await offered(staged(), {}, { title: 'Show proposals' })
    const { responseId, reference } = (await send(slug, { name: 'Mo' }, member)).body
    let sent = await told(responseId)
    expect(sent.map(n => [n.type, n.account])).toEqual([['forms.received', member.accountId]])
    expect(JSON.parse(sent[0]!.payload)).toMatchObject({ form: 'Show proposals', reference })
    expect(JSON.parse(sent[0]!.payload).link).toContain(`/account/forms/${responseId}`)

    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'return')
    sent = await told(responseId)
    expect(sent.map(n => n.type)).toEqual(['forms.received', 'forms.status', 'forms.returned'])
    // Their own move back is not news to them.
    await req('PUT', `/api/forms/mine/${responseId}`, { answers: { name: 'Mo M' } }, member)
    expect((await told(responseId)).map(n => n.type)).toEqual(['forms.received', 'forms.status', 'forms.returned'])
    await move(formId, responseId, 'approve')
    sent = await told(responseId)
    expect(sent.at(-1)).toMatchObject({ type: 'forms.status', account: member.accountId })
    expect(JSON.parse(sent.at(-1)!.payload)).toMatchObject({ status: 'Approved' })
  })

  it('tells somebody signed out at the address they gave, and nobody on an anonymous form', async () => {
    const open = await offered(staged())
    const guest = (await send(open.slug, { name: 'Gia' }, null, { email: 'gia@example.org' })).body
    expect((await told(guest.responseId)).map(n => [n.type, n.account, n.address])).toEqual([['forms.received-guest', null, 'gia@example.org']])
    await move(open.formId, guest.responseId, 'start_review')
    expect((await told(guest.responseId)).at(-1)).toMatchObject({ type: 'forms.status-guest', address: 'gia@example.org' })

    const quiet = await offered(definition(question('name')), {}, { anonymous: true })
    const anon = (await send(quiet.slug, { name: 'Nobody' }, member)).body
    expect(await told(anon.responseId)).toEqual([])
  })

  it('asks each reviewer who is to review when a round opens, and not one with a conflict', async () => {
    const { formId, slug } = await offered(staged([reviewer.accountId!, member.accountId!]))
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    await move(formId, responseId, 'start_review')
    const asked = (await told(responseId)).filter(n => n.type === 'forms.review-requested')
    expect(asked.map(n => n.account)).toEqual([reviewer.accountId])
    const [assignment] = await rows<{ id: string }>('SELECT id FROM forms_review_assignments WHERE response_id = ? AND reviewer_id = ?', responseId, reviewer.accountId)
    expect(JSON.parse(asked[0]!.payload).link).toContain(`/account/forms/review/${assignment!.id}`)
  })
})

describe('retention', () => {
  it('anonymises a response once its time is up: who sent it and what was personal go, the rest stays, and a second run does nothing', async () => {
    const def = definition(question('name', { dataClass: 'personal' }), question('why', { type: 'text.long', dataClass: 'free-text' }), question('seats', { type: 'number', dataClass: 'internal' }))
    const { slug } = await offered(def)
    const old = (await send(slug, { name: 'Mo', why: 'Because', seats: 2 }, member)).body
    const fresh = (await send(slug, { name: 'Mo', why: 'Again', seats: 3 }, member)).body
    await rows('UPDATE forms_responses SET retention_due_at = ? WHERE id = ? RETURNING id', nowMs() - 1, old.responseId)
    const sweep = () => inContext(async () => {
      const unit = createUnit()
      const n = await sweepRetention(unit.view(), nowMs())
      await unit.commit()
      return n
    })
    expect(await sweep()).toBe(1)
    const [row] = await rows<any>('SELECT person_id, unique_key, anonymised_at, state FROM forms_responses WHERE id = ?', old.responseId)
    expect(row).toMatchObject({ person_id: null, unique_key: null, state: 'submitted' })
    expect(row.anonymised_at).not.toBeNull()
    const answers = await rows<any>('SELECT question_id, value_text, value_number FROM forms_answers WHERE response_id = ? ORDER BY question_id', old.responseId)
    expect(answers.find(a => a.question_id === 'name').value_text).not.toBe('Mo')
    expect(answers.find(a => a.question_id === 'why').value_text).not.toBe('Because')
    expect(answers.find(a => a.question_id === 'seats').value_number).toBe(2)
    // One not yet due is untouched.
    expect((await rows<any>('SELECT person_id FROM forms_responses WHERE id = ?', fresh.responseId))[0].person_id).toBe(member.accountId)
    expect(await sweep()).toBe(0)
  })
})
