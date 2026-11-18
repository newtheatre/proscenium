// Slots and outcome actions (forms.slot, forms.outcome-action; FB-501, FB-506): a published form
// is attached to another module's record and answered there, each response keeping the record it
// is about; a move that carries an action asks for it with the move and it runs exactly once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { useRegistry } from '#kit/registry'
import { deliver, person, rows, sent } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, offered, publish, question, ready, req, save } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'
import type { ActionCall, OutcomeAction } from '../../server/points/outcome-action'

const keeper = person(['forms.settings.manage'], { name: 'Kit Keeper' })
const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const member = person([], { name: 'Mo Member' })
const other = person([], { name: 'Olu Other' })

const calls: ActionCall[] = []
let failing = false
const issue: OutcomeAction = {
  key: 'forms.test-issue',
  label: 'forms.test.issue',
  slot: 'forms.test-slot',
  inputs: [{ key: 'name', label: 'forms.test.name', required: true, types: ['text.short'] }, { key: 'why', label: 'forms.test.why' }],
  async preview(call) {
    return { lines: [{ label: 'forms.test.name', value: call.input.name?.text ?? '' }], warnings: call.input.why ? [] : ['No reason was given.'], ...(call.input.name?.text === 'Nobody' ? { blocked: 'Nobody can be given this.' } : {}) }
  },
  async run(unit, call) {
    if (failing) throw new Error('The award could not be issued')
    calls.push(call)
    unit.audit({ action: 'update', record: ['forms.response', call.response.id], detail: { issued: call.runId } })
    // What it made: here the form itself, which has a resolver, stands in for an award.
    return { record: ['forms.form', call.response.formId] }
  },
}

let restore = () => {}
beforeAll(async () => {
  await ready()
  for (const who of [keeper, decider, member, other]) await account(who)
  const entry = useRegistry().modules.get('forms')!
  const before = { contributes: entry.manifest.contributes, handlers: entry.handlers.contributions }
  ;(entry.manifest as any).contributes = { ...before.contributes, 'forms.slot': [{ id: 'forms.test-slot', subject: 'core.venue', attach: 'forms.settings.manage', label: 'forms.test.slot', limit: 2, source: 'core.venue' }], 'forms.outcome-action': [{ id: 'forms.test-issue', file: 'issue' }] }
  ;(entry.handlers as any).contributions = { ...before.handlers, 'forms.outcome-action': { issue } }
  restore = () => {
    ;(entry.manifest as any).contributes = before.contributes
    ;(entry.handlers as any).contributions = before.handlers
  }
})
afterAll(() => restore())

const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function nomination(map: Record<string, string> = { name: 'name', why: 'why' }): Definition {
  const workflow = reviewWorkflow(names)
  workflow.transitions.find(t => t.key === 'approve')!.actions = [{ id: 'action_1', action: 'forms.test-issue', map }]
  return { ...definition(question('name', { required: true, dataClass: 'personal' }), question('why', { type: 'text.long' })), workflow }
}
const at = (subject: string, formId = '') => `/api/forms/slots/forms.test-slot/${subject}${formId ? `/${formId}` : ''}`
const TERMS = { ...OPEN, audience: 'signed_in' }
async function published(def: Definition, title?: string): Promise<{ formId: string, slug: string }> {
  const formId = await form(title)
  expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 })).status).toBe(200)
  const done = await publish(formId, def)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { formId, slug: (await req('GET', `/api/forms/forms/${formId}`)).body.form.slug }
}
const sendAt = (slug: string, place: string, answers: Record<string, unknown>, actor: ReturnType<typeof person> | null) =>
  req('POST', `/api/forms/open/${slug}/responses?place=${place}`, { responseId: newId('fres'), answers }, actor)
const move = (formId: string, id: string, key: string) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key }, decider)
const runs = (id: string) => rows<any>('SELECT id, state, detail, action_key FROM forms_action_runs WHERE response_id = ? ORDER BY created_at, id', id)

describe('attaching a form to a record', () => {
  it('is for whoever the slot says may, takes published forms only, and holds the slot to its limit', async () => {
    const subject = newId('ven')
    const draft = await form('Not yet published')
    const a = await published(nomination(), 'Nominate somebody')
    const b = await published(definition(question('name')))
    const c = await published(definition(question('name')))

    expect((await req('GET', at(subject), undefined, member)).status).toBe(403)
    expect((await req('PUT', at(subject, a.formId), TERMS, member)).status).toBe(403)
    expect((await req('GET', '/api/forms/slots/nowhere.slot/x', undefined, keeper)).status).toBe(404)
    expect((await req('PUT', at(subject, draft), TERMS, keeper)).body.code).toBe('forms.slot.unpublished')

    const before = await req('GET', at(subject), undefined, keeper)
    expect(before.body.attached).toEqual([])
    expect(before.body.forms.map((f: any) => f.id)).toEqual(expect.arrayContaining([a.formId, b.formId]))
    expect(before.body.forms.map((f: any) => f.id)).not.toContain(draft)

    const attached = await req('PUT', at(subject, a.formId), TERMS, keeper)
    expect(attached.status, JSON.stringify(attached.body)).toBe(200)
    expect((await req('PUT', at(subject, b.formId), TERMS, keeper)).status).toBe(200)
    expect((await req('PUT', at(subject, c.formId), TERMS, keeper)).body.code).toBe('forms.slot.full')

    const there = await req('GET', at(subject), undefined, keeper)
    expect(there.body.attached.map((f: any) => f.formId)).toEqual([a.formId, b.formId])
    expect(there.body.attached[0]).toMatchObject({ title: 'Nominate somebody', status: 'active', audience: 'signed_in', responseCount: 0 })
    expect(there.body.attached[0].address).toContain(`/forms/${a.slug}?place=${attached.body.placementId}`)
    expect(there.body.forms.map((f: any) => f.id)).not.toContain(a.formId)

    // Changing the terms keeps the place; taking one away makes room, and attaching it again carries on where it was.
    expect((await req('PUT', at(subject, a.formId), { ...TERMS, status: 'paused' }, keeper)).body.placementId).toBe(attached.body.placementId)
    expect((await req('DELETE', at(subject, b.formId), {}, keeper)).status).toBe(200)
    expect((await req('DELETE', at(subject, b.formId), {}, keeper)).status).toBe(409)
    expect((await req('PUT', at(subject, c.formId), TERMS, keeper)).status).toBe(200)
    expect((await req('PUT', at(subject, b.formId), TERMS, keeper)).body.code).toBe('forms.slot.full')
  })

  it('tells a module which of a slot\'s forms the person looking could answer now', async () => {
    const subject = newId('ven')
    const other = newId('ven')
    const a = await published(nomination(), 'Nominate somebody')
    const b = await published(definition(question('name')), 'Open to all')
    const here = (who: ReturnType<typeof person> | null, q = '') => req('GET', `/api/forms/slots/forms.test-slot/open${q}`, undefined, who)
    const { placementId } = (await req('PUT', at(subject, a.formId), TERMS, keeper)).body
    expect((await req('PUT', at(other, b.formId), OPEN, keeper)).status).toBe(200)

    const mine = await here(member, `?subject=${subject}`)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body.open).toEqual([expect.objectContaining({ subjectId: subject, formId: a.formId, title: 'Nominate somebody', address: `/forms/${a.slug}?place=${placementId}` })])
    expect((await here(member)).body.open.map((f: any) => f.formId)).toEqual(expect.arrayContaining([a.formId, b.formId]))
    // Somebody signed out is offered only what anyone may answer.
    const out = (await here(null)).body.open.filter((f: any) => [subject, other].includes(f.subjectId))
    expect(out.map((f: any) => f.formId)).toEqual([b.formId])
    // A paused one is not offered.
    expect((await req('PUT', at(subject, a.formId), { ...TERMS, status: 'paused' }, keeper)).status).toBe(200)
    expect((await here(member, `?subject=${subject}`)).body.open).toEqual([])
    expect((await here(member, '')).status).toBe(200)
    expect((await req('GET', '/api/forms/slots/nowhere.slot/open', undefined, member)).status).toBe(404)
  })

  it('is answered at its own place, on its own terms, and each response keeps the record it is about', async () => {
    const [venue] = await rows<{ id: string }>('INSERT INTO core_venues (id, name, state, created_at) VALUES (?, \'The Studio\', \'active\', 0) RETURNING id', newId('ven')).catch(() => [{ id: newId('ven') }])
    const { formId, slug } = await published(nomination())
    // A form with no link of its own is not there without the place.
    expect((await req('GET', `/api/forms/open/${slug}`, undefined, member)).status).toBe(404)
    const { placementId } = (await req('PUT', at(venue!.id, formId), TERMS, keeper)).body
    expect((await req('GET', `/api/forms/open/${slug}?place=fpl_nosuchplace`, undefined, member)).status).toBe(404)

    const open = await req('GET', `/api/forms/open/${slug}?place=${placementId}`, undefined, member)
    expect(open.body).toMatchObject({ state: 'open', about: { slot: 'forms.test-slot', label: 'forms.test.slot' } })
    expect((await req('GET', `/api/forms/open/${slug}?place=${placementId}`, undefined, null)).body.state).toBe('sign-in')

    const kept = await req('PUT', `/api/forms/open/${slug}/draft?place=${placementId}`, { responseId: newId('fres'), answers: { name: 'Ann' }, pageId: null }, member)
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    const sentIn = await req('POST', `/api/forms/open/${slug}/responses?place=${placementId}`, { responseId: kept.body.responseId, answers: { name: 'Ann', why: 'Years of service' } }, member)
    expect(sentIn.status, JSON.stringify(sentIn.body)).toBe(200)
    expect((await rows<any>('SELECT placement_id, subject_type, subject_id, state FROM forms_responses WHERE id = ?', kept.body.responseId))[0])
      .toEqual({ placement_id: placementId, subject_type: 'core.venue', subject_id: venue!.id, state: 'submitted' })
    expect((await req('GET', at(venue!.id), undefined, keeper)).body.attached[0].responseCount).toBe(1)
    const read = await req('GET', `/api/forms/forms/${formId}/responses/${kept.body.responseId}`, undefined, decider)
    expect(read.body.about).toMatchObject({ slot: 'forms.test-slot', label: 'forms.test.slot' })

    // Taken away, it cannot be answered there any more; what was sent stays about the record.
    await req('DELETE', at(venue!.id, formId), {}, keeper)
    expect((await req('GET', `/api/forms/open/${slug}?place=${placementId}`, undefined, other)).status).toBe(404)
    expect((await sendAt(slug, placementId, { name: 'Bea' }, other)).status).toBe(404)
  })
})

describe('an action on a move', () => {
  it('is checked before publishing: it must be one a module offers, with every required input filled by a question that fits', async () => {
    const formId = await form()
    await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 })
    const got = await req('GET', `/api/forms/forms/${formId}`)
    expect(got.body.actions).toContainEqual({ key: 'forms.test-issue', label: 'forms.test.issue', slot: 'forms.test-slot', inputs: [{ key: 'name', label: 'forms.test.name', required: true, types: ['text.short'] }, { key: 'why', label: 'forms.test.why', required: false }] })
    const codes = async (def: Definition) => {
      await save(formId, def)
      expect((await publish(formId, def)).body.code).toBe('forms.publish.problems')
      return (await req('GET', `/api/forms/forms/${formId}/publish`)).body.problems.filter((p: any) => p.level === 'error').map((p: any) => `${p.code}@${p.at}`)
    }
    expect(await codes(nomination({}))).toEqual(['action-unmapped@move:approve'])
    expect(await codes(nomination({ name: 'why' }))).toEqual(['action-wrong-question@move:approve'])
    expect(await codes(nomination({ name: 'gone' }))).toEqual(['action-wrong-question@move:approve'])
    const unknown = nomination()
    unknown.workflow!.transitions.find(t => t.key === 'approve')!.actions![0]!.action = 'nowhere.thing'
    expect(await codes(unknown)).toEqual(['unknown-action@move:approve'])
    expect((await publish(formId, nomination({ name: 'name' }))).status).toBe(200)
  })

  it('is asked for with the move and runs once, with the answers it was mapped to and the record the response is about', async () => {
    const subject = newId('ven')
    const { formId, slug } = await published(nomination())
    const { placementId } = (await req('PUT', at(subject, formId), TERMS, keeper)).body
    const { responseId } = (await sendAt(slug, placementId, { name: 'Ann Awarded', why: 'Years of service' }, member)).body
    sent.length = 0
    calls.length = 0
    await move(formId, responseId, 'start_review')
    expect(await runs(responseId)).toEqual([])
    // Whoever is about to approve is shown what approving would do, and asking changes nothing.
    const preview = (key: string, who = decider) => req('GET', `/api/forms/forms/${formId}/responses/${responseId}/preview?move=${key}`, undefined, who)
    expect((await preview('approve')).body.previews).toEqual([{ action: 'forms.test-issue', label: 'forms.test.issue', lines: [{ label: 'forms.test.name', value: 'Ann Awarded' }], warnings: [] }])
    expect((await preview('decline')).body.previews).toEqual([])
    expect((await preview('approve', member)).status).toBe(403)
    expect(await runs(responseId)).toEqual([])
    const approved = await move(formId, responseId, 'approve')
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(await runs(responseId)).toMatchObject([{ state: 'waiting', action_key: 'forms.test-issue' }])
    expect((await req('GET', `/api/forms/forms/${formId}/responses/${responseId}`, undefined, decider)).body.actions).toMatchObject([{ label: 'forms.test.issue', state: 'waiting', canRunAgain: false }])
    expect((await rows<any>('SELECT name FROM core_events WHERE name = \'forms.response.decided\' AND record_id = ?', responseId)).length).toBe(1)

    const jobs = [...sent]
    expect(await deliver()).toContain('done')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      input: { name: { value: 'Ann Awarded', text: 'Ann Awarded' }, why: { value: 'Years of service' } },
      response: { id: responseId, formId, personId: member.accountId, subjectType: 'core.venue', subjectId: subject },
      actorId: decider.accountId,
    })
    expect(calls[0]!.response.decidedAt).not.toBeNull()
    const [run] = await runs(responseId)
    expect(run).toMatchObject({ state: 'done', id: calls[0]!.runId })
    // What the action made is linked from the response, as its own module names it.
    expect((await req('GET', `/api/forms/forms/${formId}/responses/${responseId}`, undefined, decider)).body.actions[0].record).toMatchObject({ type: 'forms.form', id: formId, to: `/console/forms/${formId}` })
    // The same message delivered again, and the job run by hand again, do nothing more.
    sent.push(...jobs)
    await deliver()
    expect(calls).toHaveLength(1)
    expect((await rows<any>('SELECT 1 FROM core_audit WHERE record_id = ? AND detail LIKE \'%issued%\'', responseId)).length).toBe(1)
    expect((await req('GET', `/api/forms/forms/${formId}/responses/${responseId}`, undefined, decider)).body.actions).toMatchObject([{ state: 'done', canRunAgain: false }])
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/actions/${run.id}/run`, {}, decider)).status).toBe(409)
  })

  it('is skipped for a response sent somewhere the action does not apply', async () => {
    const { formId, slug } = await offered(nomination())
    const { responseId } = (await req('POST', `/api/forms/open/${slug}/responses`, { responseId: newId('fres'), answers: { name: 'Lin Link' } }, member)).body
    sent.length = 0
    calls.length = 0
    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'approve')
    await deliver()
    expect(calls).toHaveLength(0)
    expect(await runs(responseId)).toMatchObject([{ state: 'skipped', detail: 'slot' }])
  })

  it('stays waiting when it fails, reads as failed once its job gives up, and can then be run again by somebody who decides', async () => {
    const subject = newId('ven')
    const { formId, slug } = await published(nomination())
    const { placementId } = (await req('PUT', at(subject, formId), TERMS, keeper)).body
    const { responseId } = (await sendAt(slug, placementId, { name: 'Flo Failed' }, member)).body
    sent.length = 0
    calls.length = 0
    await move(formId, responseId, 'start_review')
    failing = true
    await move(formId, responseId, 'approve')
    await deliver()
    const [run] = await runs(responseId)
    expect(run.state).toBe('waiting')
    // While its job may still try, it is not offered again.
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/actions/${run.id}/run`, {}, decider)).status).toBe(409)
    await rows('UPDATE core_jobs SET state = \'dead\', last_error = \'The award could not be issued\' WHERE id = (SELECT job_id FROM forms_action_runs WHERE id = ?) RETURNING id', run.id)
    const read = await req('GET', `/api/forms/forms/${formId}/responses/${responseId}`, undefined, decider)
    expect(read.body.actions).toMatchObject([{ state: 'failed', detail: 'The award could not be issued', canRunAgain: true }])
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/actions/${run.id}/run`, {}, member)).status).toBe(403)

    failing = false
    sent.length = 0
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/actions/${run.id}/run`, {}, decider)).status).toBe(200)
    await deliver()
    expect(calls).toHaveLength(1)
    expect((await runs(responseId))[0].state).toBe('done')
  })
})
