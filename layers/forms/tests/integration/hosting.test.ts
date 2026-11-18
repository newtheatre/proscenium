// What a host module does with forms in its own pages (part 4, "Services forms offers"): reads the
// forms attached to its record and sends a response in its own unit, with the checks the public
// route makes; reads its records' custom fields for its lists; says a record is gone so its fields
// go with it. And forms.action.failed, announced when an outcome action's job gives up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import { deliver, inContext, person, rows, sent } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, publish, question, ready, req } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'
import type { OutcomeAction } from '../../server/points/outcome-action'
import { addResponse, eraseRecordFields, recordFieldColumns, recordFieldValues, slotForms } from '../../server/services'

const keeper = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.decide', 'gallery.sample.manage', 'gallery.sample.view'], { name: 'Kit Keeper', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const member = person([], { name: 'Mo Member' })
const other = person([], { name: 'Olu Other' })
const editor = person(['gallery.sample.view'], { name: 'Ed Editor' })
const actorOf = (who: ReturnType<typeof person>): Actor => ({ kind: 'person', accountId: who.accountId, grants: [] } as unknown as Actor)
beforeAll(async () => {
  await ready()
  for (const who of [keeper, member, other, editor]) await account(who)
  // A host calls these inside its own request; here there is none, so the address is recorded.
  await rows('INSERT INTO core_settings (key, value, updated_at) VALUES (\'core.site.origin\', ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value', JSON.stringify('https://theatre.example'))
})

/** Runs a service in the host's own unit, committing as the host's route would. */
async function inUnit<T>(fn: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<T>, actor: Actor = actorOf(keeper)): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit.view())
    await unit.commit()
    return out
  }, actor)
}
const refusalOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? String(e))

async function published(def: Definition, title: string, mode: 'submission' | 'record' = 'submission'): Promise<string> {
  const made = await req('POST', '/api/forms/forms', { title, mode }, keeper)
  const formId = made.body.formId as string
  if (mode === 'submission') expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, keeper)).status).toBe(200)
  const done = await publish(formId, def)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return formId
}

describe('forms inside a host\'s page', () => {
  const SLOT = 'gallery.show-feedback'
  const show = `prod-${newId('tst').slice(-8).toLowerCase()}`
  let formId = ''
  beforeAll(async () => {
    formId = await published(definition(question('liked', { type: 'yesno', required: true }), question('why', { type: 'text.long', dataClass: 'free-text' })), 'Feedback on the show')
    expect((await req('PUT', `/api/forms/slots/${SLOT}/${show}/${formId}`, { ...OPEN, audience: 'signed_in', onePerPerson: true, responseCap: 2 }, keeper)).status).toBe(200)
  })

  it('lists what is attached to the record, with whether this person can answer it now', async () => {
    const asMember = await inContext(() => slotForms(SLOT, show, actorOf(member)), actorOf(member))
    expect(asMember.forms).toHaveLength(1)
    expect(asMember.forms[0]).toMatchObject({ formId, title: 'Feedback on the show', state: 'open', asksEmail: false, draft: null, version: 1 })
    expect(asMember.forms[0]!.definition!.workflow).toBeUndefined()
    // Signed out, this one is for people with an account.
    expect((await inContext(() => slotForms(SLOT, show, { kind: 'anonymous' } as Actor))).forms[0]).toMatchObject({ state: 'sign-in', definition: null })
    expect((await inContext(() => slotForms(SLOT, 'prod-nothing', actorOf(member)))).forms).toEqual([])
    expect(await refusalOf(inContext(() => slotForms('gallery.show-fields', show, actorOf(member))))).toBe('forms.slot.not-found')
  })

  it('sends a response in the host\'s unit, with the public route\'s checks, once however often it is tried', async () => {
    const send = (answers: Record<string, unknown>, who = member, responseId?: string) => inUnit(unit => addResponse(unit, { slot: SLOT, subject: show, formId, actor: actorOf(who), answers, responseId }), actorOf(who))
    expect(await refusalOf(send({ why: 'Missed the answer' }))).toBe('forms.response.invalid')
    expect(await refusalOf(inUnit(unit => addResponse(unit, { slot: SLOT, subject: 'prod-elsewhere', formId, actor: actorOf(member), answers: { liked: true } }), actorOf(member)))).toBe('forms.form.not-found')

    const responseId = newId('fres')
    const first = await send({ liked: true, why: 'The second act' }, member, responseId)
    expect(first.responseId).toBe(responseId)
    expect(await send({ liked: true, why: 'The second act' }, member, responseId)).toEqual(first)
    const [row] = await rows<any>('SELECT person_id, subject_type, subject_id, state, stage_kind FROM forms_responses WHERE id = ?', responseId)
    expect(row).toEqual({ person_id: member.accountId, subject_type: 'gallery.production', subject_id: show, state: 'submitted', stage_kind: 'closed' })
    expect(await rows('SELECT name FROM core_events WHERE record_id = ?', responseId)).toEqual([{ name: 'forms.response.submitted' }])
    expect((await rows('SELECT action FROM core_audit WHERE record_id = ?', responseId)).length).toBe(1)

    // One each, then the cap: the same reasons the form's own page gives.
    expect(await refusalOf(send({ liked: false }))).toBe('forms.link.answered')
    expect((await inContext(() => slotForms(SLOT, show, actorOf(member)))).forms[0]!.state).toBe('answered')
    await send({ liked: false }, other)
    expect((await inContext(() => slotForms(SLOT, show, actorOf(keeper)))).forms[0]!.state).toBe('full')
    expect(await refusalOf(send({ liked: true }, keeper))).toBe('forms.link.full')
    expect((await rows<any>('SELECT response_count FROM forms_placements WHERE slot_key = ? AND subject_id = ?', SLOT, show))[0].response_count).toBe(2)
  })
})

describe('custom fields read and erased by their host', () => {
  const SLOT = 'gallery.show-fields'
  let notes = ''
  let more = ''
  beforeAll(async () => {
    notes = await published(definition(question('director', { type: 'record', source: 'core.person', dataClass: 'personal' }), question('running', { type: 'number' }), question('blurb', { type: 'text.long', dataClass: 'free-text' })), 'Programme notes', 'record')
    more = await published(definition(question('running', { type: 'number' }), question('interval', { type: 'yesno', dataClass: 'public' })), 'Timings', 'record')
    for (const id of [notes, more]) expect((await req('PUT', `/api/forms/slots/${SLOT}/*/${id}`, OPEN, keeper)).status).toBe(200)
    const save = (record: string, id: string, answers: Record<string, unknown>) => req('PUT', `/api/forms/records/${SLOT}/${record}/${id}`, { answers, revision: 0 }, editor)
    expect((await save('show-a', notes, { director: keeper.accountId, running: 140, blurb: 'A tale of two cities' })).status).toBe(200)
    expect((await save('show-a', more, { running: 150, interval: true })).status).toBe(200)
    expect((await save('show-b', more, { interval: false })).status).toBe(200)
  })

  it('gives the host columns and values, records by their names', async () => {
    const columns = await inContext(() => recordFieldColumns(SLOT))
    const mine = columns.filter(c => c.formId === notes || c.formId === more)
    // Two sets both call a question "running", so each is named by its form's address as well.
    expect(mine.map(c => c.name)).toEqual(['director', expect.stringMatching(/\.running$/), 'blurb', expect.stringMatching(/\.running$/), 'interval'])
    const values = await inContext(() => recordFieldValues(SLOT, ['show-a', 'show-b', 'show-c']))
    const running = mine.filter(c => c.key === 'running').map(c => c.name)
    expect(values['show-a']).toMatchObject({ director: { value: keeper.accountId, text: 'Kit Keeper' }, [running[0]!]: { value: 140, text: '140' }, blurb: { text: 'A tale of two cities' }, [running[1]!]: { value: 150 }, interval: { value: true, text: 'Yes' } })
    expect(values['show-b']).toEqual({ interval: { value: false, text: 'No' } })
    expect(values['show-c']).toEqual({})
    expect(await refusalOf(inContext(() => recordFieldValues('gallery.show-feedback', ['show-a'])))).toBe('forms.slot.not-found')
  })

  it('lets the host say a record is gone: its fields go with it, once', async () => {
    expect(await inUnit(unit => eraseRecordFields(unit, SLOT, 'show-a'))).toBe(2)
    expect(await inUnit(unit => eraseRecordFields(unit, SLOT, 'show-a'))).toBe(0)
    expect((await inContext(() => recordFieldValues(SLOT, ['show-a', 'show-b'])))).toMatchObject({ 'show-a': {}, 'show-b': { interval: { value: false } } })
    const gone = await rows<any>('SELECT r.state, r.unique_key, a.question_id, a.value_text, a.value_json, a.label_snapshot FROM forms_responses r JOIN forms_answers a ON a.response_id = r.id WHERE r.subject_id = \'show-a\' AND r.form_id = ? ORDER BY a.question_id', notes)
    expect(gone).toEqual([
      { state: 'withdrawn', unique_key: null, question_id: 'blurb', value_text: '[removed]', value_json: null, label_snapshot: null },
      { state: 'withdrawn', unique_key: null, question_id: 'director', value_text: 'Former member', value_json: null, label_snapshot: null },
      { state: 'withdrawn', unique_key: null, question_id: 'running', value_text: null, value_json: null, label_snapshot: null },
    ])
    // The record's page starts afresh, and the set's count no longer has it.
    const page = await req('GET', `/api/forms/records/${SLOT}/show-a`, undefined, editor)
    expect(page.body.sets.find((s: { formId: string }) => s.formId === notes)).toMatchObject({ revision: 0, answers: {} })
    expect((await rows<any>('SELECT response_count FROM forms_placements WHERE form_id = ?', more))[0].response_count).toBe(1)
  })
})

describe('forms.action.failed', () => {
  let restore = () => {}
  const fail: OutcomeAction = { key: 'forms.test-fail', label: 'forms.test.fail', inputs: [], async run() { throw new Error('It could not be done') } }
  beforeAll(() => {
    const entry = useRegistry().modules.get('forms')!
    const before = { contributes: entry.manifest.contributes, handlers: entry.handlers.contributions }
    ;(entry.manifest as any).contributes = { ...before.contributes, 'forms.outcome-action': [{ id: 'forms.test-fail', file: 'fail' }] }
    ;(entry.handlers as any).contributions = { ...before.handlers, 'forms.outcome-action': { fail } }
    restore = () => {
      ;(entry.manifest as any).contributes = before.contributes
      ;(entry.handlers as any).contributions = before.handlers
    }
  })
  afterAll(() => restore())

  it('is announced, ids only, once the run\'s job has given up', async () => {
    const workflow = reviewWorkflow({ received: 'Received', review: 'In review', returned: 'Back', approved: 'Approved', declined: 'Declined', start: 'Start', back: 'Return', resubmit: 'Send', approve: 'Approve', decline: 'Decline' })
    workflow.transitions.find(t => t.key === 'approve')!.actions = [{ id: 'fails', action: 'forms.test-fail', map: {} }]
    const formId = await form('Doomed', keeper)
    expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, keeper)).status).toBe(200)
    expect((await publish(formId, { ...definition(question('name')), workflow })).status).toBe(200)
    const slug = (await req('GET', `/api/forms/forms/${formId}`, undefined, keeper)).body.form.slug
    expect((await req('PUT', `/api/forms/forms/${formId}/link`, OPEN, keeper)).status).toBe(200)
    const { responseId } = (await req('POST', `/api/forms/open/${slug}/responses`, { responseId: newId('fres'), answers: { name: 'Dee' } }, member)).body
    await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/move`, { move: 'start_review' }, keeper)
    sent.length = 0
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/move`, { move: 'approve' }, keeper)).status).toBe(200)
    const [run] = await rows<any>('SELECT id, job_id FROM forms_action_runs WHERE response_id = ?', responseId)
    await rows('UPDATE core_jobs SET max_attempts = 1 WHERE id = ? RETURNING id', run.job_id)
    expect(await deliver()).toContain('dead')
    const events = await rows<any>('SELECT payload FROM core_events WHERE name = \'forms.action.failed\' AND record_id = ?', responseId)
    expect(events.map(e => JSON.parse(e.payload))).toEqual([{ runId: run.id, responseId, formId, action: 'forms.test-fail' }])
    // A job that dies for anything else says nothing.
    expect((await rows('SELECT 1 FROM core_events WHERE name = \'forms.action.failed\'')).length).toBe(1)
  })
})
