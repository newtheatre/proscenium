// Review (FB-405 to FB-407, and the vote of change 1): a response arriving in a stage that asks for
// review opens a round with an assignment per reviewer; a reviewer reads only their own review until
// the chair releases the round; a conflict shuts a person out of the response on every route; and a
// decision needs the ability to decide and, where the form says so, a reason that is never sent on.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, definition, offered, question, raw, ready, req, send } from './stage'
import type { Definition, Review } from '../../shared/engine'
import { reviewWorkflow, summarise, tally } from '../../shared/engine'

const chair = person(['forms.response.decide'], { name: 'Cy Chair' })
const mover = person(['forms.response.move'], { name: 'Mia Mover' })
const ann = person([], { name: 'Ann Panel' })
const ben = person([], { name: 'Ben Panel' })
// On the panel, and also able to read and export every response of the form.
const cat = person(['forms.response.decide', 'forms.response.export'], { name: 'Cat Panel', reassertedAt: Date.UTC(2026, 10, 18, 12) })
const member = person([], { name: 'Mo Member' })
const outsider = person([], { name: 'Olu Other' })

beforeAll(async () => {
  await ready()
  for (const who of [chair, mover, ann, ben, cat, member, outsider]) await account(who)
})

const names = { received: 'Received', review: 'With the panel', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function reviewed(review: Review, more: { needsReason?: boolean } = {}): Definition {
  const workflow = reviewWorkflow(names)
  workflow.stages[1]!.review = review
  if (more.needsReason) workflow.transitions.find(t => t.key === 'decline')!.needsReason = true
  return { ...definition(question('name', { required: true, dataClass: 'personal' }), question('needs', { type: 'text.long', dataClass: 'special' })), workflow }
}
const panel = (...who: ReturnType<typeof person>[]) => ({ people: who.map(p => p.accountId!) })
const vote = (who: ReturnType<typeof person>[], more: Partial<Review> = {}): Review => ({ mode: 'vote', reviewers: panel(...who), pass: 'majority', quorum: 2, ...more })
const scores = (who: ReturnType<typeof person>[], more: Partial<Review> = {}): Review => ({ mode: 'scores', reviewers: panel(...who), criteria: [{ id: 'idea', label: 'The idea', max: 5, weight: 2 }, { id: 'plan', label: 'The plan', max: 10 }], ...more })

const move = (formId: string, id: string, key: string, actor = chair, more: Record<string, unknown> = {}) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key, ...more }, actor)
const one = (formId: string, id: string, actor = chair) => req('GET', `/api/forms/forms/${formId}/responses/${id}`, undefined, actor)
const waiting = async (who: ReturnType<typeof person>) => (await req('GET', '/api/forms/reviews', undefined, who)).body.reviews as any[]
const review = (id: string, who: ReturnType<typeof person>) => req('GET', `/api/forms/reviews/${id}`, undefined, who)
const hand = (id: string, who: ReturnType<typeof person>, body: Record<string, unknown>) => req('PUT', `/api/forms/reviews/${id}`, body, who)

/** A response sent by somebody and put in front of the panel; answers each reviewer's assignment id by name. */
async function inReview(def: Definition, from = member) {
  const { formId, slug } = await offered(def)
  const { responseId, reference } = (await send(slug, { name: 'Mo', needs: 'Private' }, from)).body
  expect((await move(formId, responseId, 'start_review', mover)).status).toBe(200)
  const mine = async (who: ReturnType<typeof person>) => (await waiting(who)).find(r => r.reference === reference)?.assignmentId as string
  return { formId, responseId, reference, mine }
}

describe('counting', () => {
  it('counts a vote by its pass mark over the votes cast, with abstentions towards the least number only', () => {
    expect(tally({ pass: 'majority', quorum: 3 }, ['for', 'for', 'against'])).toMatchObject({ for: 2, against: 1, quorate: true, passed: true })
    expect(tally({ pass: 'majority', quorum: 3 }, ['for', 'against', 'abstain'])).toMatchObject({ quorate: true, passed: false })
    expect(tally({ pass: 'majority', quorum: 3 }, ['for', 'for'])).toMatchObject({ quorate: false, passed: false })
    expect(tally({ pass: 'two-thirds', quorum: 1 }, ['for', 'for', 'against'])).toMatchObject({ passed: true })
    expect(tally({ pass: 'two-thirds', quorum: 1 }, ['for', 'against'])).toMatchObject({ passed: false })
    expect(tally({ pass: 'unanimous', quorum: 1 }, ['for', 'abstain'])).toMatchObject({ passed: true })
    expect(tally({ pass: 'unanimous', quorum: 1 }, ['for', 'against'])).toMatchObject({ passed: false })
    expect(tally({ pass: 'unanimous', quorum: 1 }, ['abstain'])).toMatchObject({ passed: false })
  })

  it('summarises scores as a mean and spread for each criterion and a weighted total', () => {
    const s = summarise([{ id: 'idea', label: 'Idea', max: 5, weight: 2 }, { id: 'plan', label: 'Plan', max: 10 }], [{ idea: 4, plan: 6 }, { idea: 2, plan: 10 }])
    expect(s).toMatchObject({ reviews: 2, total: 14, outOf: 20 })
    expect(s.criteria[0]).toMatchObject({ mean: 3, low: 2, high: 4 })
  })
})

describe('a round of review', () => {
  it('opens when a response reaches the stage, with one assignment for each reviewer, and closes when it leaves', async () => {
    const { formId, responseId, mine } = await inReview(reviewed(vote([ann, ben, cat])))
    expect(await rows<any>('SELECT status FROM forms_review_assignments WHERE response_id = ?', responseId)).toHaveLength(3)
    expect(await mine(ann)).toBeTruthy()
    expect(await mine(outsider)).toBeUndefined()
    expect((await one(formId, responseId)).body.review).toMatchObject({ mode: 'vote', open: true, released: false, assigned: 3, submitted: 0, tally: null, reviews: null, canRelease: true })
    expect((await move(formId, responseId, 'approve')).status).toBe(200)
    expect((await rows<any>('SELECT closed_at FROM forms_review_rounds WHERE response_id = ?', responseId))[0].closed_at).not.toBeNull()
    expect(await mine(ann)).toBeUndefined()
  })

  it('shows a reviewer the answers but never the restricted ones, and nobody else their review', async () => {
    const { mine } = await inReview(reviewed(vote([ann, ben])))
    const id = await mine(ann)
    const read = await review(id, ann)
    expect(read.status).toBe(200)
    expect(read.body).toMatchObject({ mode: 'vote', open: true, released: false, result: { tally: null } })
    expect(read.body.definition.workflow).toBeUndefined()
    expect(read.body.answers.find((a: any) => a.questionId === 'name').value).toBe('Mo')
    expect(read.body.answers.find((a: any) => a.questionId === 'needs')).toMatchObject({ restricted: true })
    expect(JSON.stringify(read.body)).not.toContain('Private')
    expect((await review(id, ben)).status).toBe(404)
    expect((await hand(id, ben, { vote: 'for' })).status).toBe(404)
  })

  it('keeps votes private until the chair releases them, then shows the panel the tally and only the chair who voted how', async () => {
    const { formId, responseId, mine } = await inReview(reviewed(vote([ann, ben, cat])))
    expect((await hand(await mine(ann), ann, {})).status).toBe(422)
    expect((await hand(await mine(ann), ann, { vote: 'for', comment: 'A strong case' })).status).toBe(200)
    expect((await hand(await mine(ben), ben, { vote: 'against' })).status).toBe(200)
    expect((await review(await mine(ann), ann)).body).toMatchObject({ mine: { status: 'submitted', vote: 'for', comment: 'A strong case' }, result: { submitted: 2, tally: null, reviews: null } })
    // Before release even the chair sees only how many are in.
    expect((await one(formId, responseId)).body.review).toMatchObject({ submitted: 2, tally: null, reviews: null })

    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, mover)).status).toBe(403)
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, chair)).status).toBe(200)
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, chair)).status).toBe(409)

    const seen = (await review(await mine(ben), ben)).body
    expect(seen.result.tally).toMatchObject({ for: 1, against: 1, quorate: true, passed: false })
    expect(seen.result.reviews).toBeNull()
    const led = (await one(formId, responseId)).body.review
    expect(led).toMatchObject({ released: true, canRelease: false })
    expect(led.reviews).toMatchObject([{ reviewer: 'Ann Panel', vote: 'for', comment: 'A strong case' }, { reviewer: 'Ben Panel', vote: 'against' }])
    // Somebody who may only move responses sees how far the round has got and no result.
    expect((await one(formId, responseId, mover)).body.review).toMatchObject({ submitted: 2, tally: null, reviews: null, canRelease: false })
    // Once released, a review no longer changes.
    expect((await hand(await mine(cat), cat, { vote: 'for' })).status).toBe(409)
  })

  it('shows nobody who voted how when the vote is secret', async () => {
    const { formId, responseId, mine } = await inReview(reviewed(vote([ann, ben], { secret: true })))
    await hand(await mine(ann), ann, { vote: 'for' })
    await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, chair)
    expect((await one(formId, responseId)).body.review).toMatchObject({ tally: { for: 1 }, reviews: null })
  })

  it('takes marks within each criterion only, and after release shows the panel the summary and each review', async () => {
    const { formId, responseId, mine } = await inReview(reviewed(scores([ann, ben])))
    expect((await hand(await mine(ann), ann, { scores: { idea: 4 } })).status).toBe(422)
    expect((await hand(await mine(ann), ann, { scores: { idea: 6, plan: 3 } })).status).toBe(422)
    expect((await hand(await mine(ann), ann, { scores: { idea: 4, plan: 6 } })).status).toBe(200)
    expect((await hand(await mine(ben), ben, { scores: { idea: 2, plan: 10 }, comment: 'Ambitious' })).status).toBe(200)
    expect((await review(await mine(ann), ann)).body.result).toMatchObject({ summary: null, reviews: null })
    await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, chair)
    const seen = (await review(await mine(ann), ann)).body.result
    expect(seen.summary).toMatchObject({ reviews: 2, total: 14, outOf: 20 })
    expect(seen.reviews).toHaveLength(2)
  })

  it('never shows the person who sent the response anything of its review', async () => {
    const { responseId, mine } = await inReview(reviewed(scores([ann, ben])))
    await hand(await mine(ann), ann, { scores: { idea: 4, plan: 6 }, comment: 'Not for their eyes' })
    const own = await req('GET', `/api/forms/mine/${responseId}`, undefined, member)
    expect(own.status).toBe(200)
    expect(own.body.definition.workflow).toBeUndefined()
    expect(JSON.stringify(own.body)).not.toContain('Not for their eyes')
    expect(JSON.stringify(own.body)).not.toContain(ann.accountId)
  })

  it('opens a new round when a returned response comes back, on the answers as changed', async () => {
    const { formId, responseId, mine } = await inReview(reviewed(vote([ann, ben])))
    const first = await mine(ann)
    await move(formId, responseId, 'return', mover)
    expect((await req('PUT', `/api/forms/mine/${responseId}`, { answers: { name: 'Mo, again', needs: 'Private' } }, member)).status).toBe(200)
    const second = await mine(ann)
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    expect((await review(second, ann)).body.answers.find((a: any) => a.questionId === 'name').value).toBe('Mo, again')
  })
})

describe('a conflict of interest', () => {
  it('is recorded without being declared for a reviewer who sent the response', async () => {
    const { formId, responseId, reference } = await inReview(reviewed(vote([ann, ben, cat])), ann)
    expect((await waiting(ann)).find(r => r.reference === reference)).toBeUndefined()
    expect((await rows<any>('SELECT status, conflict FROM forms_review_assignments WHERE response_id = ? AND reviewer_id = ?', responseId, ann.accountId))[0]).toMatchObject({ status: 'conflicted', conflict: 'automatic' })
    expect((await one(formId, responseId)).body.review).toMatchObject({ assigned: 2, conflicted: 1 })
  })

  it('once declared shuts the reviewer out of the response on every route, whatever else they hold', async () => {
    const { formId, responseId, reference, mine } = await inReview(reviewed(vote([ann, ben, cat])))
    const id = await mine(cat)
    await hand(id, cat, { vote: 'for', comment: 'Before I realised' })
    expect((await one(formId, responseId, cat)).status).toBe(200)
    expect((await req('POST', `/api/forms/reviews/${id}/conflict`, {}, cat)).status).toBe(200)

    expect((await rows<any>('SELECT status, conflict, vote, comment FROM forms_review_assignments WHERE id = ?', id))[0]).toEqual({ status: 'conflicted', conflict: 'declared', vote: null, comment: null })
    expect((await review(id, cat)).status).toBe(403)
    expect((await hand(id, cat, { vote: 'for' })).status).toBe(403)
    expect(await mine(cat)).toBeUndefined()
    expect((await one(formId, responseId, cat)).status).toBe(403)
    expect((await move(formId, responseId, 'approve', cat)).status).toBe(403)
    expect((await req('POST', `/api/forms/forms/${formId}/responses/${responseId}/release`, {}, cat)).status).toBe(403)
    const listed = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, cat)
    expect(listed.body).toMatchObject({ total: 0, rows: [] })
    expect((await raw('GET', `/api/forms/forms/${formId}/responses/export`, cat)).text).not.toContain(reference)
    // Everybody else carries on.
    expect((await req('GET', `/api/forms/forms/${formId}/responses`, undefined, chair)).body.total).toBe(1)
    expect((await one(formId, responseId)).body.review).toMatchObject({ assigned: 2, conflicted: 1, submitted: 0 })
  })
})

describe('a decision', () => {
  it('needs the ability to decide: somebody who may only move responses is not offered it and cannot make it', async () => {
    const { formId, responseId } = await inReview(reviewed(vote([ann, ben])))
    expect((await one(formId, responseId, mover)).body.moves.map((m: any) => m.key)).toEqual(['return'])
    expect((await one(formId, responseId)).body.moves.map((m: any) => m.key)).toEqual(['return', 'approve', 'decline'])
    expect((await move(formId, responseId, 'approve', mover)).status).toBe(403)
  })

  it('asks for a reason where the form says so, keeps it for the record and never sends it to the person', async () => {
    const { formId, responseId } = await inReview(reviewed(vote([ann, ben]), { needsReason: true }))
    const bare = await move(formId, responseId, 'decline')
    expect(bare.status).toBe(422)
    expect(bare.body.fields).toMatchObject({ reason: 'forms.decision.no-reason' })
    expect((await move(formId, responseId, 'decline', chair, { reason: 'Clashes with the spring season', note: 'Thank you for applying.' })).status).toBe(200)
    expect((await rows<any>('SELECT decided_at, decision_reason, stage_kind FROM forms_responses WHERE id = ?', responseId))[0]).toMatchObject({ decision_reason: 'Clashes with the spring season', stage_kind: 'declined' })
    expect((await one(formId, responseId)).body.decision).toMatchObject({ reason: 'Clashes with the spring season' })
    expect((await one(formId, responseId, mover)).body.decision).toMatchObject({ reason: null })
    const own = await req('GET', `/api/forms/mine/${responseId}`, undefined, member)
    expect(own.body.progress).toMatchObject({ kind: 'declined', note: 'Thank you for applying.' })
    expect(JSON.stringify(own.body)).not.toContain('spring season')
    const audit = await rows<any>('SELECT * FROM core_audit WHERE record_id = ?', responseId)
    expect(JSON.stringify(audit)).not.toContain('spring season')
  })
})
