// Stages (FB-403, FB-404): a response moves through the stages of the version it was sent on, only
// by moves that version opens from where it is and to that mover, never by its own sender; a
// returned response is changed by its sender and comes back as a new revision.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, definition, offered, publish, question, raw, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'

const mover = person(['forms.response.move', 'forms.response.decide'], { name: 'Mia Mover' })
const second = person(['forms.response.move', 'forms.response.decide'], { name: 'Sol Second' })
const reader = person(['forms.response.read'], { name: 'Rae Reader' })
const exporter = person(['forms.response.export'], { name: 'Ed Exporter', reassertedAt: Date.UTC(2026, 10, 18, 12) })
const member = person([], { name: 'Mo Member' })
const other = person([], { name: 'Olu Other' })
const both = person(['forms.response.move'], { name: 'Bo Both' })

beforeAll(async () => {
  await ready()
  for (const who of [mover, second, reader, exporter, member, other, both]) await account(who)
})

const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
const staged = (): Definition => ({
  ...definition(question('name', { required: true, dataClass: 'personal' }), question('why', { type: 'text.long' }), question('needs', { type: 'text.long', dataClass: 'special' })),
  workflow: reviewWorkflow(names),
})
const move = (formId: string, id: string, key: string, actor = mover, note?: string) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key, ...(note ? { note } : {}) }, actor)
const one = (formId: string, id: string, actor = mover, query = '') => req('GET', `/api/forms/forms/${formId}/responses/${id}${query}`, undefined, actor)
const row = async (id: string) => (await rows<any>('SELECT stage_key, stage_kind, stage_note, current_revision, retention_due_at FROM forms_responses WHERE id = ?', id))[0]

describe('a form without stages', () => {
  it('receives a response and that is the end of it: nothing about stages is shown, and nothing can move it', async () => {
    const { formId, slug } = await offered(definition(question('name')))
    const sent = await send(slug, { name: 'Mo' }, member)
    expect(await row(sent.body.responseId)).toMatchObject({ stage_key: 'received', stage_kind: 'closed' })
    expect((await row(sent.body.responseId)).retention_due_at).not.toBeNull()
    const read = await one(formId, sent.body.responseId)
    expect(read.body).toMatchObject({ stage: null, moves: [], history: [], revision: 1, revisions: 1, changed: [] })
    expect((await move(formId, sent.body.responseId, 'approve')).status).toBe(409)
    const mine = await req('GET', `/api/forms/mine/${sent.body.responseId}`, undefined, member)
    expect(mine.body.progress).toBeNull()
  })
})

describe('moving a response', () => {
  it('starts in the first stage with its arrival in the history, and its retention does not run yet', async () => {
    const { formId, slug } = await offered(staged())
    const sent = await send(slug, { name: 'Mo' }, member)
    expect(await row(sent.body.responseId)).toMatchObject({ stage_key: 'received', stage_kind: 'pending', retention_due_at: null })
    const read = await one(formId, sent.body.responseId)
    expect(read.body.stage).toMatchObject({ key: 'received', name: 'Received', kind: 'pending' })
    expect(read.body.moves.map((m: any) => m.key)).toEqual(['start_review'])
    expect(read.body.history).toMatchObject([{ from: null, to: 'Received', by: 'Mo Member', revision: 1 }])
  })

  it('makes a move with its history, audit entry and event together, and starts retention at a final stage', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    const moved = await move(formId, responseId, 'start_review')
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body.stage).toMatchObject({ key: 'in_review', kind: 'in_review' })
    expect((await move(formId, responseId, 'approve')).status).toBe(200)
    expect(await row(responseId)).toMatchObject({ stage_key: 'approved', stage_kind: 'approved' })
    expect((await row(responseId)).retention_due_at).not.toBeNull()
    expect(await rows('SELECT from_stage, to_stage, transition_key FROM forms_stage_history WHERE response_id = ? ORDER BY at, id', responseId)).toEqual([
      { from_stage: null, to_stage: 'received', transition_key: 'submit' },
      { from_stage: 'received', to_stage: 'in_review', transition_key: 'start_review' },
      { from_stage: 'in_review', to_stage: 'approved', transition_key: 'approve' },
    ])
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM core_audit WHERE record_type = \'forms.response\' AND record_id = ? AND action = \'state\'', responseId))[0]!.n).toBe(2)
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM core_events WHERE name = \'forms.response.moved\' AND json_extract(payload, \'$.responseId\') = ?', responseId))[0]!.n).toBe(2)
    const read = await one(formId, responseId)
    expect(read.body.moves).toEqual([])
    expect(read.body.history.map((h: any) => [h.move, h.by])).toEqual([['submit', 'Mo Member'], ['Start review', 'Mia Mover'], ['Approve', 'Mia Mover']])
  })

  it('refuses a move that is not open from the current stage, one for the sender only, and anyone without the ability', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    expect((await move(formId, responseId, 'approve')).body.code).toBe('forms.stage.not-open')
    expect((await move(formId, responseId, 'nonsense')).status).toBe(409)
    expect((await move(formId, responseId, 'start_review', reader)).status).toBe(403)
    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'return')
    expect((await move(formId, responseId, 'resubmit')).body.code).toBe('forms.stage.not-open')
    expect(await row(responseId)).toMatchObject({ stage_key: 'returned' })
  })

  it('lets nobody move their own response, and offers them no moves', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Bo' }, both)).body
    expect((await one(formId, responseId, both)).body.moves).toEqual([])
    const refused = await move(formId, responseId, 'start_review', both)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('forms.stage.own-response')
    expect((await move(formId, responseId, 'start_review')).status).toBe(200)
  })

  it('when two people move a response at once, one move is made', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    await move(formId, responseId, 'start_review')
    const results = await Promise.all([move(formId, responseId, 'approve'), move(formId, responseId, 'decline', second)])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect((await rows('SELECT 1 FROM forms_stage_history WHERE response_id = ?', responseId)).length).toBe(3) // not-policy: arrival, review, one decision
  })

  it('keeps the stages of the version a response was sent on', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Mo' }, member)).body
    // The next version has no stages at all.
    expect((await publish(formId, definition(question('name', { required: true, dataClass: 'personal' }), question('why', { type: 'text.long' }), question('needs', { type: 'text.long', dataClass: 'special' })), { confirm: true })).status).toBe(200)
    expect((await move(formId, responseId, 'start_review')).status).toBe(200)
    const later = (await send(slug, { name: 'Olu' }, other)).body.responseId
    expect(await row(later)).toMatchObject({ stage_key: 'received', stage_kind: 'closed' })
  })

  it('shows the stage in the table, filters by it and exports it', async () => {
    const { formId, slug } = await offered(staged())
    const a = (await send(slug, { name: 'Mo' }, member)).body.responseId
    await send(slug, { name: 'Olu' }, other)
    await move(formId, a, 'start_review')
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(table.body.stages.map((s: any) => s.key)).toEqual(['received', 'in_review', 'returned', 'approved', 'declined'])
    expect(table.body.rows.map((r: any) => r.stage.name).sort()).toEqual(['In review', 'Received'])
    const filtered = await req('GET', `/api/forms/forms/${formId}/responses?stage=in_review`, undefined, reader)
    expect(filtered.body.rows.map((r: any) => r.id)).toEqual([a])
    const csv = await raw('GET', `/api/forms/forms/${formId}/responses/export?stage=in_review`, exporter)
    expect(csv.text.split('\r\n')[0]).toBe('Reference,Sent,Version,From,Stage,name,why')
    expect(csv.text.split('\r\n')[1]).toContain(',In review,Mo,')
  })
})

describe('returning a response for changes', () => {
  it('tells the person what to change, takes their changes as a new revision and leaves the first as it was', async () => {
    const { formId, slug } = await offered(staged())
    const { responseId } = (await send(slug, { name: 'Mo', why: 'Because', needs: 'Quiet room' }, member)).body
    const put = (answers: Record<string, unknown>, actor = member) => req('PUT', `/api/forms/mine/${responseId}`, { answers }, actor)
    // Not while it is with staff.
    expect((await put({ name: 'Mo', why: 'Changed' })).body.code).toBe('forms.response.not-returned')
    await move(formId, responseId, 'start_review')
    expect((await move(formId, responseId, 'return', mover, 'Please say more about why.')).status).toBe(200)

    const mine = await req('GET', `/api/forms/mine/${responseId}`, undefined, member)
    expect(mine.body.progress).toEqual({ status: 'Back with you', kind: 'returned', note: 'Please say more about why.', canChange: true })
    // What has happened so far, in the words the form chose for them and with nobody named.
    expect(mine.body.history.at(-1)).toMatchObject({ status: 'Back with you', kind: 'returned' })
    expect(mine.body.history).toHaveLength(3)
    const listed = await req('GET', '/api/forms/mine', undefined, member)
    expect(listed.body.sent.find((s: any) => s.responseId === responseId).progress).toEqual({ status: 'Back with you', kind: 'returned', canChange: true })

    // Nobody else's to change, and still checked.
    expect((await put({ name: 'Olu' }, other)).status).toBe(404)
    const invalid = await put({ why: 'No name' })
    expect(invalid.status).toBe(422)
    expect(invalid.body.fields).toHaveProperty('name')

    const again = await put({ name: 'Mo', why: 'Because I have run the lighting desk for three years.', needs: 'Quiet room' })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.status).toBe('In review')
    expect(await row(responseId)).toMatchObject({ stage_key: 'in_review', current_revision: 2, stage_note: null })
    expect(await rows('SELECT revision, value_text FROM forms_answers WHERE response_id = ? AND question_id = \'why\' ORDER BY revision', responseId)).toEqual([
      { revision: 1, value_text: 'Because' },
      { revision: 2, value_text: 'Because I have run the lighting desk for three years.' },
    ])
    // A second send of the same changes finds nothing to do.
    expect((await put({ name: 'Mo', why: 'Again' })).body.code).toBe('forms.response.not-returned')

    // Staff see the latest, what changed, and can read the one before.
    const latest = await one(formId, responseId)
    expect(latest.body).toMatchObject({ revision: 2, revisions: 2, changed: ['why'] })
    expect(latest.body.answers.find((a: any) => a.questionId === 'why').value).toContain('lighting desk')
    const first = await one(formId, responseId, mover, '?revision=1')
    expect(first.body).toMatchObject({ revision: 1, changed: [] })
    expect(first.body.answers.find((a: any) => a.questionId === 'why').value).toBe('Because')
    expect(latest.body.history.map((h: any) => `${h.move} r${h.revision}`)).toEqual(['submit r1', 'Start review r1', 'Return for changes r1', 'Send changes r2'])
    // The table shows the latest revision.
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(table.body.rows[0].cells.why.text).toContain('lighting desk')
  })
})

describe('one move on several responses', () => {
  const many = (formId: string, body: Record<string, unknown>, actor = mover) => req('POST', `/api/forms/forms/${formId}/responses/move`, body, actor)

  it('moves those that can take it, each with its own history and message, and names those it left', async () => {
    const { formId, slug } = await offered(staged())
    const ids: string[] = []
    for (const who of [member, other, mover]) ids.push((await send(slug, { name: who.name }, who)).body.responseId)
    const [first, secondId, own] = ids as [string, string, string]
    await move(formId, secondId, 'start_review')
    // The table offers each stage's moves, so the screen knows what the chosen rows share.
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, person(['forms.response.read', 'forms.response.move'], { name: 'Tab Table' }))
    expect(table.body.stages[0].moves).toEqual([{ key: 'start_review', label: 'Start review', to: 'In review', toKind: 'in_review', decision: false, needsReason: false }])
    expect(table.body.stages[1].moves.map((m: { key: string }) => m.key)).toEqual(['return'])
    expect(table.body.rows[0].stage.key).toBeDefined()

    const done = await many(formId, { responses: [first, secondId, own, 'fres_nothing', first], move: 'start_review', note: 'We have started.' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.moved).toBe(1)
    expect(done.body.skipped).toHaveLength(3)
    expect(done.body.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual(['There is no response here.', 'This move is not open from where the response is now.', 'You cannot move your own response.'])
    expect(await row(first)).toMatchObject({ stage_key: 'in_review', stage_note: 'We have started.' })
    expect(await row(own)).toMatchObject({ stage_key: 'received' })
    expect(await rows('SELECT transition_key FROM forms_stage_history WHERE response_id = ? ORDER BY at, id', first)).toEqual([{ transition_key: 'submit' }, { transition_key: 'start_review' }])
  })

  it('moves a long selection: each response is saved on its own, so the number chosen is not a limit', async () => {
    const { formId, slug } = await offered(staged())
    const ids: string[] = []
    // More than one unit of work could hold, each from its own sender so no sender's rate limit is met.
    for (let i = 0; i < 14; i++) { // not-policy: a test size
      const who = person([], { name: `Sender ${i}` })
      await account(who)
      ids.push((await send(slug, { name: who.name }, who)).body.responseId)
    }
    const done = await many(formId, { responses: ids, move: 'start_review', note: 'We have started.' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toEqual({ moved: 14, skipped: [] })
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(table.body.rows.every((r: { stage: { name: string } }) => r.stage.name === 'In review')).toBe(true)
  })

  it('is refused whole when the mover may not decide, or for somebody who may not move at all', async () => {
    const { formId, slug } = await offered(staged())
    const id = (await send(slug, { name: 'Mo' }, member)).body.responseId
    await move(formId, id, 'start_review')
    expect((await many(formId, { responses: [id], move: 'approve' }, both)).body.code).toBe('forms.decision.not-allowed')
    expect((await many(formId, { responses: [id], move: 'approve' }, reader)).status).toBe(403)
    expect((await many(formId, { responses: [], move: 'approve' })).status).toBe(422)
    expect((await many(formId, { responses: [id], move: 'approve' })).body).toEqual({ moved: 1, skipped: [] })
  })
})
