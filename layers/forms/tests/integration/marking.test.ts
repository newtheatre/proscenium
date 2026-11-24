// Marking a quiz on the server (FB-513): the score is the server's (MK1), stored with the response
// and worked out again when the answers change (MK5); the person is shown what the form says (MK4);
// the correct answers reach nobody but those who may mark; a host may pin the version it showed.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, type Actor } from '#kit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, question, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { addResponse, slotFormVersion } from '../../server/services'

const marker = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.form.mark', 'forms.response.read'], { name: 'Mia Marker', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const member = person([], { name: 'Mo Member' })
const host = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.form.mark', 'gallery.sample.manage', 'gallery.sample.view'], { name: 'Hal Host', reassertedAt: Date.UTC(2026, 10, 17, 12) })
const actorOf = (who: ReturnType<typeof person>): Actor => ({ kind: 'person', accountId: who.accountId, grants: [] } as unknown as Actor)

beforeAll(async () => {
  await ready()
  for (const who of [marker, member, host]) await account(who)
  await rows('INSERT INTO core_settings (key, value, updated_at) VALUES (\'core.site.origin\', ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value', JSON.stringify('https://theatre.example'))
})

const EXITS = [{ id: 'left', label: 'Stage left' }, { id: 'right', label: 'Stage right' }, { id: 'foyer', label: 'Foyer' }]
const quiz = (show: NonNullable<Definition['marking']>['show'] = 'score-and-feedback', exit = 'left'): Definition => ({
  ...definition(
    question('name', { required: true, dataClass: 'personal' }),
    question('exit', { type: 'choice.single', options: EXITS, answer: { correct: [exit], points: 2, feedback: { right: 'Yes, the nearest', wrong: 'Look at the plan by the door' } } }),
    question('alone', { type: 'yesno', answer: { correct: false } }),
  ),
  marking: { passMark: 2, show },
})

/** Saves and publishes as somebody who may mark, so the correct answers go in. */
async function publishQuiz(formId: string, def: Definition, who = marker) {
  const { body } = await req('GET', `/api/forms/forms/${formId}`, undefined, who)
  const saved = await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: def, editRevision: body.draft.editRevision }, who)
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  const done = await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision: saved.body.editRevision }, who)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return done
}
async function offeredQuiz(def: Definition, more: Record<string, unknown> = {}): Promise<{ formId: string, slug: string }> {
  const formId = (await req('POST', '/api/forms/forms', { title: `Front of house quiz ${newId('tst').slice(-6)}` }, marker)).body.formId as string
  expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365, ...more }, marker)).status).toBe(200)
  await publishQuiz(formId, def)
  expect((await req('PUT', `/api/forms/forms/${formId}/link`, OPEN, marker)).status).toBe(200)
  return { formId, slug: (await req('GET', `/api/forms/forms/${formId}`, undefined, marker)).body.form.slug }
}
const stored = async (id: string) => (await rows<{ score: number | null, out_of: number | null, passed: number | null }>('SELECT score, out_of, passed FROM forms_responses WHERE id = ?', id))[0]
const KEY = /"answer"|passMark/

describe('marking-on-server-only', () => {
  it('marks what was sent against the published key, whatever the request claims', async () => {
    const { slug } = await offeredQuiz(quiz())
    const opened = await req('GET', `/api/forms/open/${slug}`, undefined, member)
    expect(JSON.stringify(opened.body)).not.toMatch(KEY)
    expect(opened.body.definition.marking).toEqual({ show: 'score-and-feedback' })

    const sent = await req('POST', `/api/forms/open/${slug}/responses`, { responseId: newId('fres'), answers: { name: 'Mo', exit: 'right', alone: false }, score: 99, passed: true, marking: { score: 99 } }, member)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body.marking).toEqual({
      score: 1, outOf: 3, passed: false,
      questions: [
        { questionId: 'exit', label: 'Question exit', correct: false, feedback: 'Look at the plan by the door' },
        { questionId: 'alone', label: 'Question alone', correct: true },
      ],
    })
    expect(await stored(sent.body.responseId)).toEqual({ score: 1, out_of: 3, passed: 0 })
  })

  it('shows the score only, or the correct answers too, as the form says', async () => {
    const scoreOnly = await offeredQuiz(quiz('score'))
    const plain = await send(scoreOnly.slug, { name: 'Mo', exit: 'left', alone: false }, member)
    expect(plain.body.marking).toEqual({ score: 3, outOf: 3, passed: true, questions: [] })

    const answers = await offeredQuiz(quiz('score-feedback-and-answers'))
    const full = await send(answers.slug, { name: 'Mo', exit: 'foyer', alone: false }, member)
    expect(full.body.marking.questions[0]).toMatchObject({ correct: false, answer: 'Stage left' })
    // Their own copy says the same, and still carries no key.
    const own = await req('GET', `/api/forms/mine/${full.body.responseId}`, undefined, member)
    expect(own.body.marking).toEqual(full.body.marking)
    expect(JSON.stringify(own.body.definition)).not.toMatch(KEY)
  })

  it('stores no score on a form without correct answers', async () => {
    const { slug } = await offeredQuiz(definition(question('name')))
    const sent = await send(slug, { name: 'Mo' }, member)
    expect(sent.body.marking).toBeNull()
    expect(await stored(sent.body.responseId)).toEqual({ score: null, out_of: null, passed: null })
  })
})

describe('who may see and set the correct answers', () => {
  it('shows staff reading a response how it was marked, never the key', async () => {
    const { formId, slug } = await offeredQuiz(quiz())
    const id = (await send(slug, { name: 'Mo', exit: 'left', alone: true }, member)).body.responseId
    const read = await req('GET', `/api/forms/forms/${formId}/responses/${id}`, undefined, marker)
    expect(read.status).toBe(200)
    expect(read.body.marking).toMatchObject({ score: 2, outOf: 3, passed: true, perQuestion: [{ questionId: 'exit', correct: true, points: 2 }, { questionId: 'alone', correct: false, points: 0 }] })
    expect(JSON.stringify(read.body.definition)).not.toMatch(KEY)
  })

  it('keeps the key from somebody who may edit but not mark, and ignores theirs when they save', async () => {
    const { formId } = await offeredQuiz(quiz())
    const editor = person(['forms.form.edit'], { name: 'Ed Editor' })
    await account(editor)
    const opened = await req('GET', `/api/forms/forms/${formId}`, undefined, editor)
    expect(opened.body.canMark).toBe(false)
    expect(JSON.stringify(opened.body.draft)).not.toMatch(/"answer"|"marking"/)
    for (const path of [`/api/forms/forms/${formId}/versions/1`, `/api/forms/forms/${formId}/export`]) expect(JSON.stringify((await req('GET', path, undefined, editor)).body)).not.toMatch(KEY)

    const reworded = opened.body.draft.definition as Definition
    reworded.pages[0]!.items[1] = { ...reworded.pages[0]!.items[1] as never, label: 'Where is the nearest exit?', answer: { correct: ['foyer'] } }
    expect((await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: reworded, editRevision: opened.body.draft.editRevision }, editor)).status).toBe(200)
    const after = (await req('GET', `/api/forms/forms/${formId}`, undefined, marker)).body
    expect(after.canMark).toBe(true)
    expect(after.draft.definition.pages[0].items[1]).toMatchObject({ label: 'Where is the nearest exit?', answer: { correct: ['left'], points: 2 } })
    expect(after.draft.definition.marking).toEqual({ passMark: 2, show: 'score-and-feedback' })
  })

  it('lets nobody publish a pass mark above the points there are', async () => {
    const formId = (await req('POST', '/api/forms/forms', { title: 'Too hard' }, marker)).body.formId as string
    const { body } = await req('GET', `/api/forms/forms/${formId}`, undefined, marker)
    const saved = await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: { ...quiz(), marking: { passMark: 4, show: 'score' } }, editRevision: body.draft.editRevision }, marker)
    const published = await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision: saved.body.editRevision }, marker)
    expect(published.status).toBe(422)
    expect(published.body.code).toBe('forms.publish.problems')
  })
})

describe('marking again when the answers change (MK5)', () => {
  it('marks a changed response again and keeps the earlier score readable', async () => {
    const { formId, slug } = await offeredQuiz(quiz(), { allowEdits: true })
    const id = (await send(slug, { name: 'Mo', exit: 'foyer', alone: true }, member)).body.responseId
    expect(await stored(id)).toEqual({ score: 0, out_of: 3, passed: 0 })
    const changed = await req('PUT', `/api/forms/mine/${id}`, { answers: { name: 'Mo', exit: 'left', alone: false } }, member)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(await stored(id)).toEqual({ score: 3, out_of: 3, passed: 1 })
    const earlier = await req('GET', `/api/forms/forms/${formId}/responses/${id}?revision=1`, undefined, marker)
    expect(earlier.body.marking).toMatchObject({ score: 0, outOf: 3, passed: false })
  })
})

describe('marking-pinned-version', () => {
  const SLOT = 'gallery.show-feedback'
  const show = `prod-${newId('tst').slice(-8).toLowerCase()}`
  async function inUnit<T>(fn: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<T>, actor: Actor): Promise<T> {
    return inContext(async () => {
      const unit = createUnit()
      const out = await fn(unit.view())
      await unit.commit()
      return out
    }, actor)
  }
  const refusalOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? String(e))

  it('marks against the version the host pinned, and refuses a version of another form', async () => {
    const formId = (await req('POST', '/api/forms/forms', { title: 'Pinned quiz' }, host)).body.formId as string
    expect((await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, host)).status).toBe(200)
    await publishQuiz(formId, quiz('score', 'left'), host)
    const first = (await rows<{ id: string }>('SELECT id FROM forms_versions WHERE form_id = ? AND number = 1', formId))[0]!.id
    await publishQuiz(formId, quiz('score', 'foyer'), host)
    expect((await req('PUT', `/api/forms/slots/${SLOT}/${show}/${formId}`, { ...OPEN, audience: 'signed_in' }, host)).status).toBe(200)
    const placement = (await rows<{ id: string }>('SELECT id FROM forms_placements WHERE form_id = ?', formId))[0]!.id

    const read = await inContext(() => slotFormVersion(placement, first), actorOf(member))
    expect(read.version).toBe(1)
    expect(JSON.stringify(read.definition)).not.toMatch(KEY)

    const answers = { name: 'Mo', exit: 'left', alone: false }
    const pinned = await inUnit(unit => addResponse(unit, { slot: SLOT, subject: show, formId, actor: actorOf(member), answers, versionId: first }), actorOf(member))
    expect(pinned.marking).toMatchObject({ score: 3, outOf: 3, passed: true, perQuestion: [{ fieldKey: 'exit', correct: true }, { fieldKey: 'alone', correct: true }] })
    const live = await inUnit(unit => addResponse(unit, { slot: SLOT, subject: show, formId, actor: actorOf(member), answers }), actorOf(member))
    expect(live.marking).toMatchObject({ score: 1, passed: false })

    const otherForm = (await rows<{ id: string }>('SELECT id FROM forms_versions WHERE form_id <> ? LIMIT 1', formId))[0]!.id
    expect(await refusalOf(inUnit(unit => addResponse(unit, { slot: SLOT, subject: show, formId, actor: actorOf(member), answers, versionId: otherForm }), actorOf(member)))).toBe('forms.version-not-of-form')
    expect(await refusalOf(inContext(() => slotFormVersion(placement, otherForm), actorOf(member)))).toBe('forms.version-not-of-form')
  })
})

describe('the quiz template (FB-515)', () => {
  it('starts a quiz that publishes and is marked as it stands', async () => {
    const formId = (await req('POST', '/api/forms/forms', { title: `Safety quiz ${newId('tst').slice(-6)}`, template: 'forms.quiz' }, marker)).body.formId as string
    const { body } = await req('GET', `/api/forms/forms/${formId}`, undefined, marker)
    expect(body.draft.definition.marking).toEqual({ passMark: 5, show: 'score-and-feedback' })
    expect((await req('POST', `/api/forms/forms/${formId}/publish`, { editRevision: body.draft.editRevision }, marker)).status).toBe(200)
    expect((await req('PUT', `/api/forms/forms/${formId}/link`, OPEN, marker)).status).toBe(200)
    const sent = await send(body.form.slug, { exits: 'two', alarm: ['stop', 'guide', 'count'], lifts: false, capacity: 200, point: 'The Car Park' }, member)
    expect(sent.body.marking).toMatchObject({ score: 6, outOf: 6, passed: true })
  })
})
