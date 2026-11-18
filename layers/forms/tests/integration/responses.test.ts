// Answering and reading responses (FB-301 to FB-304, FB-401, FB-402, FB-601): a form on a link is
// answered by the people the link allows, within its dates and its cap; sending stores everything
// together and once; special-category answers are held sealed and opened only on purpose.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, newId } from '#kit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { eraseAccount } from '../../../core/server/identity/erasure'
import { NOV_17, account, definition, offered, question, raw, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'

const reader = person(['forms.response.read'], { name: 'Rae Reader' })
const exporter = person(['forms.response.export'], { name: 'Ed Exporter', reassertedAt: NOV_17 + 86_400_000 })
const welfare = person(['forms.response.read-special', 'forms.response.export'], { name: 'Wyn Welfare', reassertedAt: NOV_17 + 86_400_000 })
const member = person([], { name: 'Mo Member' })
const other = person([], { name: 'Olu Other' })

beforeAll(async () => {
  await ready()
  for (const who of [reader, exporter, welfare, member, other]) await account(who)
})

const simple = () => definition(
  question('name', { required: true, dataClass: 'personal' }),
  question('role', { type: 'choice.single', options: [{ id: 'cast', label: 'Cast' }, { id: 'crew', label: 'Crew' }] }),
  question('why', { type: 'text.long', visibleWhen: { left: { answer: 'role' }, op: 'is', right: { option: 'cast' } } }),
  question('needs', { type: 'text.long', dataClass: 'special' }),
)

describe('a form on a link', () => {
  it('is not there until it is published and given a link', async () => {
    const draft = await req('POST', '/api/forms/forms', { title: 'Not yet shared' })
    expect((await req('GET', '/api/forms/open/not-yet-shared', undefined, null)).status).toBe(404)
    expect((await req('PUT', `/api/forms/forms/${draft.body.formId}/link`, { audience: 'anyone', opensAt: null, closesAt: null, responseCap: null, onePerPerson: false, status: 'active' }, person(['forms.form.edit']))).status).toBe(403)
  })

  it('shows its questions to anyone when open, and asks someone signed out for an address', async () => {
    const { slug } = await offered(simple())
    const signedOut = await req('GET', `/api/forms/open/${slug}`, undefined, null)
    expect(signedOut.body).toMatchObject({ state: 'open', asksEmail: true, signedIn: false, today: '2026-11-17' })
    expect(signedOut.body.definition.pages[0].items).toHaveLength(4)
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, member)).body).toMatchObject({ state: 'open', asksEmail: false, signedIn: true })
  })

  it('says why it cannot be answered, and refuses a submission all the same', async () => {
    const future = await offered(simple(), { opensAt: NOV_17 + 3_600_000 })
    expect((await req('GET', `/api/forms/open/${future.slug}`, undefined, null)).body).toMatchObject({ state: 'not-yet', definition: null })
    expect((await send(future.slug, { name: 'Early' }, member)).body).toMatchObject({ code: 'forms.link.not-yet' })

    const past = await offered(simple(), { closesAt: NOV_17 - 1 })
    expect((await req('GET', `/api/forms/open/${past.slug}`, undefined, null)).body.state).toBe('closed')
    expect((await send(past.slug, { name: 'Late' }, member)).status).toBe(409)

    const members = await offered(simple(), { audience: 'signed_in' })
    expect((await req('GET', `/api/forms/open/${members.slug}`, undefined, null)).body).toMatchObject({ state: 'sign-in', remedy: 'Sign in, then open the form again.' })
    expect((await send(members.slug, { name: 'Nobody' }, null, { email: 'n@example.org' })).status).toBe(401)

    const paused = await offered(simple(), { status: 'paused' })
    expect((await req('GET', `/api/forms/open/${paused.slug}`, undefined, member)).body.state).toBe('paused')
  })

  it('refuses dates the wrong way round, and one response each on an anonymous form', async () => {
    const { formId } = await offered(simple())
    expect((await req('PUT', `/api/forms/forms/${formId}/link`, { audience: 'anyone', opensAt: 2000, closesAt: 1000, responseCap: null, onePerPerson: false, status: 'active' })).body.fields).toEqual({ closesAt: 'forms.link.dates' })
    const anonymous = await offered(simple(), {}, { anonymous: true })
    expect((await req('PUT', `/api/forms/forms/${anonymous.formId}/link`, { audience: 'anyone', opensAt: null, closesAt: null, responseCap: null, onePerPerson: true, status: 'active' })).body.code).toBe('forms.link.anonymous-once')
  })
})

describe('sending', () => {
  it('stores the response and one row per answer, drops what logic hides and seals special answers', async () => {
    const { formId, slug } = await offered(simple())
    const sent = await send(slug, { name: 'Mo', role: 'crew', why: 'Hidden, because crew was chosen', needs: 'A step-free route' }, member)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body.reference).toMatch(/^[A-Z2-9]{8}$/)

    const [response] = await rows<any>('SELECT * FROM forms_responses WHERE id = ?', sent.body.responseId)
    expect(response).toMatchObject({ form_id: formId, state: 'submitted', stage_kind: 'closed', person_id: member.accountId, respondent_email: null, current_revision: 1, submitted_at: NOV_17, retention_due_at: NOV_17 + 365 * 86_400_000 })
    const answers = await rows<any>('SELECT question_id, data_class, value_text, value_cipher, label_snapshot FROM forms_answers WHERE response_id = ? ORDER BY question_id', sent.body.responseId)
    expect(answers.map(a => a.question_id)).toEqual(['name', 'needs', 'role'])
    expect(answers[0]).toMatchObject({ data_class: 'personal', value_text: 'Mo' })
    expect(answers[2]).toMatchObject({ value_text: 'crew', label_snapshot: 'Crew' })
    // The special answer is nowhere in the clear.
    expect(answers[1]).toMatchObject({ data_class: 'special', value_text: null })
    expect(answers[1].value_cipher).not.toContain('step-free')
    expect((await rows<any>('SELECT response_count FROM forms_placements WHERE form_id = ?', formId))[0].response_count).toBe(1)
    expect(await rows('SELECT 1 FROM core_events WHERE name = ? AND record_id = ?', 'forms.response.submitted', sent.body.responseId)).toHaveLength(1)
  })

  it('refuses answers that are not valid and names each, storing nothing', async () => {
    const { formId, slug } = await offered(simple())
    const sent = await send(slug, { role: 'director' }, member)
    expect(sent.status).toBe(422)
    expect(sent.body).toMatchObject({ code: 'forms.response.invalid', fields: { name: 'forms.issues.required', role: 'forms.issues.option' } })
    expect(await rows('SELECT 1 FROM forms_responses WHERE form_id = ?', formId)).toHaveLength(0)
    expect((await rows<any>('SELECT response_count FROM forms_placements WHERE form_id = ?', formId))[0].response_count).toBe(0)
  })

  it('stores one response when the same submission is sent twice', async () => {
    const { formId, slug } = await offered(simple())
    const body = { responseId: newId('fres'), answers: { name: 'Mo' } }
    const first = await req('POST', `/api/forms/open/${slug}/responses`, body, member)
    const second = await req('POST', `/api/forms/open/${slug}/responses`, body, member)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(await rows('SELECT 1 FROM forms_responses WHERE form_id = ?', formId)).toHaveLength(1)
    // Somebody else presenting that id learns nothing.
    expect((await req('POST', `/api/forms/open/${slug}/responses`, body, other)).status).toBe(404)
  })

  it('takes an address from someone signed out, and nothing at all on an anonymous form', async () => {
    const named = await offered(simple())
    expect((await send(named.slug, { name: 'Sam' }, null)).body).toMatchObject({ code: 'forms.response.email-needed' })
    const sent = await send(named.slug, { name: 'Sam' }, null, { email: ' Sam@Example.org ' })
    expect((await rows<any>('SELECT person_id, respondent_email FROM forms_responses WHERE id = ?', sent.body.responseId))[0]).toEqual({ person_id: null, respondent_email: 'sam@example.org' })

    const anonymous = await offered(simple(), {}, { anonymous: true })
    const quiet = await send(anonymous.slug, { name: 'Nobody' }, member, { email: 'mo@example.org' })
    expect((await rows<any>('SELECT person_id, respondent_email, unique_key FROM forms_responses WHERE id = ?', quiet.body.responseId))[0]).toEqual({ person_id: null, respondent_email: null, unique_key: null })
  })

  it('with a cap of two, three sent at once store exactly two', async () => {
    const { formId, slug } = await offered(simple(), { responseCap: 2 })
    const results = await Promise.all([member, other, null].map((who, i) => send(slug, { name: `Person ${i}` }, who, who ? {} : { email: 'third@example.org' })))
    expect(results.map(r => r.status).sort()).toEqual([200, 200, 409])
    expect(await rows('SELECT 1 FROM forms_responses WHERE form_id = ? AND state = ?', formId, 'submitted')).toHaveLength(2)
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, null)).body.state).toBe('full')
  })

  it('with one response each, two sent at once by one person store exactly one', async () => {
    const { formId, slug } = await offered(simple(), { onePerPerson: true })
    const results = await Promise.all([send(slug, { name: 'Mo' }, member), send(slug, { name: 'Mo again' }, member)])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await rows('SELECT 1 FROM forms_responses WHERE form_id = ?', formId)).toHaveLength(1)
    // The place the refused one tried to take is not counted.
    expect((await rows<any>('SELECT response_count FROM forms_placements WHERE form_id = ?', formId))[0].response_count).toBe(1)
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, member)).body.state).toBe('answered')
    expect((await send(slug, { name: 'Olu' }, other)).status).toBe(200)
    // Signed out, the address stands for the person.
    expect((await send(slug, { name: 'Sam' }, null, { email: 'sam@example.org' })).status).toBe(200)
    expect((await send(slug, { name: 'Sam' }, null, { email: 'SAM@example.org' })).status).toBe(409)
  })
})

describe('a working copy', () => {
  it('is kept sealed for someone signed in, comes back on any device, and goes when the response is sent', async () => {
    const { slug } = await offered(simple())
    const responseId = newId('fres')
    expect((await req('PUT', `/api/forms/open/${slug}/draft`, { responseId, answers: { name: 'Mo', needs: 'Quiet room' }, pageId: 'page-1' }, null)).status).toBe(401)
    const kept = await req('PUT', `/api/forms/open/${slug}/draft`, { responseId, answers: { name: 'Mo', needs: 'Quiet room' }, pageId: 'page-1' }, member)
    expect(kept.body).toEqual({ responseId })
    const [stored] = await rows<any>('SELECT answers_cipher FROM forms_response_drafts WHERE response_id = ?', responseId)
    expect(stored.answers_cipher).not.toContain('Quiet')

    // Another device, with an id of its own, carries on with the same working copy.
    const again = await req('PUT', `/api/forms/open/${slug}/draft`, { responseId: newId('fres'), answers: { name: 'Mo M', needs: 'Quiet room' }, pageId: 'page-1' }, member)
    expect(again.body).toEqual({ responseId })
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, member)).body.draft).toEqual({ responseId, answers: { name: 'Mo M', needs: 'Quiet room' }, pageId: 'page-1' })
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, other)).body.draft).toBeNull()
    expect((await req('GET', '/api/forms/mine', undefined, member)).body.drafts).toContainEqual(expect.objectContaining({ responseId, slug, open: true }))

    const sent = await req('POST', `/api/forms/open/${slug}/responses`, { responseId, answers: { name: 'Mo M', needs: 'Quiet room' } }, member)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(await rows('SELECT 1 FROM forms_response_drafts WHERE response_id = ?', responseId)).toHaveLength(0)
    expect((await rows<any>('SELECT state FROM forms_responses WHERE id = ?', responseId))[0].state).toBe('submitted')
    const mine = await req('GET', '/api/forms/mine', undefined, member)
    expect(mine.body.sent).toContainEqual(expect.objectContaining({ responseId, reference: sent.body.reference }))
    expect(mine.body.drafts.find((d: any) => d.responseId === responseId)).toBeUndefined()
  })

  it('lets a person read their own response in full, and nobody else', async () => {
    const { slug } = await offered(simple())
    const sent = await send(slug, { name: 'Mo', needs: 'Quiet room' }, member)
    const own = await req('GET', `/api/forms/mine/${sent.body.responseId}`, undefined, member)
    expect(own.body.answers.find((a: any) => a.questionId === 'needs')).toMatchObject({ restricted: false, value: 'Quiet room' })
    expect((await req('GET', `/api/forms/mine/${sent.body.responseId}`, undefined, other)).status).toBe(404)
  })
})

describe('the responses table', () => {
  let formId = ''
  let slug = ''
  let ids: string[] = []
  beforeAll(async () => {
    ({ formId, slug } = await offered(simple()))
    ids = []
    for (const [who, answers] of [[member, { name: 'Mo', role: 'cast', why: 'I love it', needs: 'Quiet room' }], [other, { name: '=Olu', role: 'crew' }]] as const) {
      advanceClock(1000)
      ids.push((await send(slug, answers, who)).body.responseId)
    }
  })

  it('needs the ability, on this form or everywhere', async () => {
    expect((await req('GET', `/api/forms/forms/${formId}/responses`, undefined, member)).status).toBe(403)
    expect((await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)).status).toBe(200)
    // The form's creator reads its responses as its owner.
    expect((await req('GET', `/api/forms/forms/${formId}/responses`)).status).toBe(200)
  })

  it('has a row per response and a column per question, newest first, with special answers restricted', async () => {
    const { body } = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(body.columns.map((c: any) => c.key)).toEqual(['name', 'role', 'why', 'needs'])
    expect(body).toMatchObject({ total: 2, page: 1, canExport: false, canReadSpecial: false })
    expect(body.rows.map((r: any) => r.who)).toEqual(['Olu Other', 'Mo Member'])
    expect(body.rows[1].cells).toEqual({ name: { text: 'Mo', restricted: false }, role: { text: 'Cast', restricted: false }, why: { text: 'I love it', restricted: false }, needs: { text: '', restricted: true } })
  })

  it('filters by an answer, from the address', async () => {
    const { body } = await req('GET', `/api/forms/forms/${formId}/responses?question=role&value=cast`, undefined, reader)
    expect(body.rows.map((r: any) => r.id)).toEqual([ids[0]])
    expect(body.total).toBe(1)
  })

  it('marks a question the form no longer asks', async () => {
    const next = simple()
    next.pages[0]!.items.splice(2, 1)
    const { body: got } = await req('GET', `/api/forms/forms/${formId}`)
    const saved = await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: next as Definition, editRevision: got.draft.editRevision })
    expect((await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision: saved.body.editRevision, confirm: true })).status).toBe(200)
    const { body } = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(body.columns.map((c: any) => [c.key, c.retired])).toEqual([['name', false], ['role', false], ['needs', false], ['why', true]])
    expect(body.rows[1].cells.why.text).toBe('I love it')
  })

  it('opens a special answer only for someone who may, one response at a time, and records it', async () => {
    const plain = await req('GET', `/api/forms/forms/${formId}/responses/${ids[0]}`, undefined, reader)
    expect(plain.body.restricted).toBe(true)
    expect(plain.body.answers.find((a: any) => a.questionId === 'needs')).toMatchObject({ restricted: true, value: null })
    expect((await req('GET', `/api/forms/forms/${formId}/responses/${ids[0]}?reveal=1`, undefined, reader)).status).toBe(403)
    const opened = await req('GET', `/api/forms/forms/${formId}/responses/${ids[0]}?reveal=1`, undefined, welfare)
    expect(opened.body.answers.find((a: any) => a.questionId === 'needs')).toMatchObject({ restricted: false, value: 'Quiet room' })
    expect(await rows('SELECT 1 FROM core_audit WHERE ability = ? AND record_id = ?', 'forms.response.read-special', ids[0])).toHaveLength(1)
    // A response of another form is not found through this one.
    const elsewhere = await offered(simple())
    expect((await req('GET', `/api/forms/forms/${elsewhere.formId}/responses/${ids[0]}`, undefined, reader)).status).toBe(404)
  })

  it('exports the same view as CSV, without special answers unless asked for, and records it', async () => {
    expect((await raw('GET', `/api/forms/forms/${formId}/responses/export`, reader)).status).toBe(403)
    const csv = await raw('GET', `/api/forms/forms/${formId}/responses/export`, exporter)
    expect(csv.type).toContain('text/csv')
    const lines = csv.text.trim().split('\r\n')
    expect(lines[0]).toBe('Reference,Sent,Version,From,name,role,why (removed)')
    expect(lines).toHaveLength(3)
    // A cell a spreadsheet would run is written as text.
    expect(lines[1]).toContain(",Olu Other,'=Olu,Crew,")
    expect(lines[2]).toContain(',Mo Member,Mo,Cast,I love it')
    expect((await raw('GET', `/api/forms/forms/${formId}/responses/export?special=1`, exporter)).status).toBe(403)
    const full = await raw('GET', `/api/forms/forms/${formId}/responses/export?special=1&question=role&value=cast`, welfare)
    expect(full.text.trim().split('\r\n')).toHaveLength(2)
    expect(full.text).toContain('Quiet room')
    expect((await rows('SELECT 1 FROM core_audit WHERE action = ? AND record_id = ?', 'export', formId)).length).toBe(2)
  })
})

describe('erasing a person', () => {
  it('treats each answer by its class, unlinks the response and removes working copies', async () => {
    const gone = person([], { name: 'Gil Gone' })
    await account(gone)
    const def = definition(
      question('name', { dataClass: 'personal' }),
      question('about', { type: 'text.long', dataClass: 'free-text' }),
      question('needs', { type: 'text.long', dataClass: 'special' }),
      question('size', { type: 'choice.single', dataClass: 'internal', options: [{ id: 'm', label: 'Medium' }] }),
    )
    const sent = await offered(def, { onePerPerson: true })
    const kept = await offered(def)
    const response = await send(sent.slug, { name: 'Gil', about: 'I once played Hamlet', needs: 'A hearing loop', size: 'm' }, gone)
    const draftId = newId('fres')
    await req('PUT', `/api/forms/open/${kept.slug}/draft`, { responseId: draftId, answers: { name: 'Gil' }, pageId: null }, gone)
    const bystander = await send(sent.slug, { name: 'Mo', about: 'Stays as it is' }, member)

    await inContext(() => eraseAccount(gone.accountId!))

    const answers = Object.fromEntries((await rows<any>('SELECT question_id, value_text, value_cipher, label_snapshot FROM forms_answers WHERE response_id = ?', response.body.responseId)).map(a => [a.question_id, a]))
    expect(answers.name.value_text).toBe('Former member')
    expect(answers.about.value_text).toBe('[removed]')
    expect(answers.needs.value_cipher).toBeNull()
    expect(answers.size).toMatchObject({ value_text: 'm', label_snapshot: 'Medium' })
    // The response stays, as a row about nobody: its account is now a tombstone with no name.
    expect((await rows<any>('SELECT unique_key, calculated, state FROM forms_responses WHERE id = ?', response.body.responseId))[0]).toEqual({ unique_key: null, calculated: null, state: 'submitted' })
    expect(await rows('SELECT 1 FROM forms_response_drafts WHERE response_id = ?', draftId)).toHaveLength(0)
    // Nobody else's answers are touched.
    expect((await rows<any>('SELECT value_text FROM forms_answers WHERE response_id = ? AND question_id = ?', bystander.body.responseId, 'about'))[0].value_text).toBe('Stays as it is')
  })

  it('still refuses any other change to an answer, and any delete', async () => {
    const { slug } = await offered(simple())
    const sent = await send(slug, { name: 'Mo' }, member)
    await expect(rows('UPDATE forms_answers SET value_text = ? WHERE response_id = ? RETURNING 1', 'Changed', sent.body.responseId)).rejects.toThrow(/append-only/)
    await expect(rows('DELETE FROM forms_answers WHERE response_id = ? RETURNING 1', sent.body.responseId)).rejects.toThrow(/append-only/)
  })
})
