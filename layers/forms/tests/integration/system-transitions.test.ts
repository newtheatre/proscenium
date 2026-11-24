// Moves the system makes by itself (FB-514): taken on arrival in a stage, the first whose condition
// holds (AT2), with no actor; a chain stops after five and the health check names the form (AT3); a
// loop it can see refuses to publish; only somebody who may mark sets them.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, question, ready, req, send } from './stage'
import type { Condition, Definition, Stage, Transition } from '../../shared/engine'
import loops from '../../server/contributions/core.health-check/system-loops'

const marker = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.form.mark', 'forms.response.read', 'forms.response.move', 'forms.response.decide'], { name: 'Mia Marker', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const editor = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish'], { name: 'Ed Editor', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const member = person([], { name: 'Mo Member' })

beforeAll(async () => {
  await ready()
  for (const who of [marker, editor, member]) await account(who)
})

const answered: Condition = { left: { answer: 'name' }, op: 'answered' }
const stage = (key: string, kind: Stage['kind'] = 'pending'): Stage => ({ key, name: key, kind })
const by = (who: Transition['who'], from: string, to: string, more: Partial<Transition> = {}): Transition => ({ key: `${from}_${to}`, from, to, label: `${from} to ${to}`, who, ...more })
const flow = (stages: Stage[], transitions: Transition[], ...more: Definition['pages'][number]['items']): Definition => ({
  ...definition(question('name'), question('age', { type: 'number' }), ...more as never[]),
  workflow: { stages, transitions },
})

async function draft(def: Definition, who = marker): Promise<{ formId: string, editRevision: number }> {
  const formId = (await req('POST', '/api/forms/forms', { title: `Automatic ${newId('tst').slice(-6)}` }, who)).body.formId as string
  expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, who)).status).toBe(200)
  const { body } = await req('GET', `/api/forms/forms/${formId}`, undefined, who)
  const saved = await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: def, editRevision: body.draft.editRevision }, who)
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  return { formId, editRevision: saved.body.editRevision }
}
async function offered(def: Definition): Promise<{ formId: string, slug: string }> {
  const { formId, editRevision } = await draft(def)
  const done = await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision }, marker)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  expect((await req('PUT', `/api/forms/forms/${formId}/link`, OPEN, marker)).status).toBe(200)
  return { formId, slug: (await req('GET', `/api/forms/forms/${formId}`, undefined, marker)).body.form.slug }
}
const history = (id: string) => rows<{ from_stage: string | null, to_stage: string, transition_key: string, actor_id: string | null }>('SELECT from_stage, to_stage, transition_key, actor_id FROM forms_stage_history WHERE response_id = ? ORDER BY at, id', id)
const problems = async (formId: string) => JSON.stringify((await req('GET', `/api/forms/forms/${formId}/publish`, undefined, marker)).body.problems)
const where = async (id: string) => (await rows<{ stage_key: string }>('SELECT stage_key FROM forms_responses WHERE id = ?', id))[0]!.stage_key

describe('taking a system move', () => {
  it('takes the first move whose condition holds on arrival, in definition order, with no actor', async () => {
    const adults: Condition = { left: { answer: 'age' }, op: 'at-least', right: { value: 18 } }
    const { slug } = await offered(flow(
      [stage('received'), stage('adult', 'approved'), stage('anyone', 'in_review'), stage('young', 'declined')],
      [by('system', 'received', 'adult', { when: adults }), by('system', 'received', 'anyone', { when: answered }), by('staff', 'received', 'young')],
    ))
    const grown = (await send(slug, { name: 'Ada', age: 30 }, member)).body.responseId
    expect(await history(grown)).toEqual([
      { from_stage: null, to_stage: 'received', transition_key: 'submit', actor_id: member.accountId },
      { from_stage: 'received', to_stage: 'adult', transition_key: 'received_adult', actor_id: null },
    ])
    const child = (await send(slug, { name: 'Kit', age: 12 }, member)).body.responseId
    expect(await where(child)).toBe('anyone')
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM core_events WHERE name = \'forms.response.moved\' AND json_extract(payload, \'$.responseId\') = ?', child))[0]!.n).toBe(1)
  })

  it('stays put when no condition holds, and moves on from where a staff move lands', async () => {
    const { formId, slug } = await offered(flow(
      [stage('received'), stage('checked', 'in_review'), stage('done', 'approved')],
      [by('staff', 'received', 'checked'), by('system', 'checked', 'done', { when: { left: { answer: 'age' }, op: 'more-than', right: { value: 10 } } })],
    ))
    const id = (await send(slug, { name: 'Ada', age: 30 }, member)).body.responseId
    expect(await where(id)).toBe('received')
    const moved = await req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: 'received_checked' }, marker)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body.stage).toMatchObject({ key: 'done' })
    expect((await history(id)).map(h => [h.transition_key, h.actor_id])).toEqual([['submit', member.accountId], ['received_checked', marker.accountId], ['checked_done', null]])
  })

  it('reads what a quiz scored in the condition', async () => {
    const quiz: Definition = {
      ...flow(
        [stage('received'), stage('passed', 'approved'), stage('failed', 'declined')],
        [by('system', 'received', 'passed', { when: { left: { marking: 'passed' }, op: 'is', right: { value: true } } }), by('system', 'received', 'failed', { when: { left: { marking: 'percent' }, op: 'less-than', right: { value: 50 } } })],
        question('alone', { type: 'yesno', answer: { correct: false } }),
      ),
      marking: { passMark: 1, show: 'score' },
    }
    const { slug } = await offered(quiz)
    expect(await where((await send(slug, { name: 'Ada', alone: false }, member)).body.responseId)).toBe('passed')
    expect(await where((await send(slug, { name: 'Kit', alone: true }, member)).body.responseId)).toBe('failed')
  })
})

describe('a chain of system moves', () => {
  it('stops after five in one go, and the health check names the form until a new version is live', async () => {
    const keys = ['s0', 's1', 's2', 's3', 's4', 's5', 's6']
    const { formId, slug } = await offered(flow(keys.map(k => stage(k)), keys.slice(1).map((k, i) => by('system', keys[i]!, k, { when: answered }))))
    const sent = await send(slug, { name: 'Ada' }, member)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const id = sent.body.responseId
    expect(await where(id)).toBe('s5')
    expect((await history(id)).filter(h => h.actor_id === null)).toHaveLength(5)
    const health = await inContext(() => loops.check())
    expect(health.state).toBe('warning')
    expect(health.sentence).toContain((await req('GET', `/api/forms/forms/${formId}`, undefined, marker)).body.form.title)
  })

  it('refuses to publish moves the system could make round in a loop', async () => {
    const { formId, editRevision } = await draft(flow(
      [stage('a'), stage('b'), stage('c', 'closed')],
      [by('system', 'a', 'b', { when: answered }), by('system', 'b', 'a', { when: answered }), by('staff', 'b', 'c')],
    ))
    const published = await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision }, marker)
    expect(published.status).toBe(422)
    expect(await problems(formId)).toContain('system-loop')
  })
})

describe('setting system moves', () => {
  it('needs a condition on a system move and refuses one on any other', async () => {
    const { formId, editRevision } = await draft(flow(
      [stage('a'), stage('b', 'closed')],
      [by('system', 'a', 'b'), by('staff', 'b', 'a', { when: answered, key: 'back' })],
    ))
    const published = await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision }, marker)
    expect(published.status).toBe(422)
    expect(await problems(formId)).toContain('system-no-condition')
    expect(await problems(formId)).toContain('condition-not-system')
  })

  it('keeps them from somebody who may edit the form but not mark it: what they send is ignored, and what was there stays', async () => {
    const def = flow([stage('a'), stage('b', 'closed')], [by('system', 'a', 'b', { when: answered })])
    const { formId } = await draft(def)
    const seen = (await req('GET', `/api/forms/forms/${formId}`, undefined, editor)).body
    expect(JSON.stringify(seen.draft.definition)).not.toContain('"system"')
    const theirs = flow([stage('a'), stage('b', 'closed')], [by('system', 'b', 'a', { when: answered, key: 'sneaky' }), by('staff', 'a', 'b', { key: 'staff_move' })])
    expect((await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: theirs, editRevision: seen.draft.editRevision }, editor)).status).toBe(200)
    const kept = (await req('GET', `/api/forms/forms/${formId}`, undefined, marker)).body.draft.definition as Definition
    expect(kept.workflow!.transitions.map(t => t.key).sort()).toEqual(['a_b', 'staff_move'])
  })
})
