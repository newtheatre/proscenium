// Reminders: an unfinished working copy left untouched, a form about to close on one, a response
// returned for changes and not sent back, and a review still owed. Each goes once, and none once
// the thing it is about is done.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { sendReminders } from '../../server/reminders'
import { NOV_17, account, definition, offered, question, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'

const DAY = 86_400_000
const decider = person(['forms.response.decide'], { name: 'Dee Decider' })
const people = Array.from({ length: 8 }, (_, i) => person([], { name: `Person ${i}` }))
const [idler, sender, closer, pauser, returner, reviewer, other, early] = people as [ReturnType<typeof person>, ...ReturnType<typeof person>[]]

beforeAll(async () => {
  await ready()
  for (const who of [decider, ...people]) await account(who)
  // Outside a request, links are built on the address the theatre recorded.
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function staged(reviewers?: string[]): Definition {
  const workflow = reviewWorkflow(names)
  if (reviewers) workflow.stages.find(s => s.kind === 'in_review')!.review = { mode: 'vote', reviewers: { people: reviewers } }
  return { ...definition(question('name', { required: true })), workflow }
}
const run = (at: number) => inContext(async () => {
  const unit = createUnit()
  const n = await sendReminders(unit.view(), at)
  await unit.commit()
  return n
})
const toldOf = (type: string, who: ReturnType<typeof person>) => rows<{ payload: string }>('SELECT payload FROM core_notifications WHERE type_key = ? AND account_id = ? ORDER BY created_at, id', type, who.accountId)
const keep = (slug: string, who: ReturnType<typeof person>) => req('PUT', `/api/forms/open/${slug}/draft`, { responseId: newId('fres'), answers: { name: 'So far' }, pageId: null }, who)
const move = (formId: string, id: string, key: string) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key }, decider)

describe('unfinished working copies', () => {
  it('reminds a signed-in person once their answers have sat untouched, once only, and not after they send', async () => {
    setClock(NOV_17)
    const { slug } = await offered(definition(question('name')), {}, { title: 'Volunteer sign-up' })
    expect((await keep(slug, idler)).status).toBe(200)
    const kept = await keep(slug, sender)
    expect((await send(slug, { name: 'Done' }, sender, { responseId: kept.body.responseId })).status).toBe(200)

    await run(NOV_17 + 6 * DAY)
    expect(await toldOf('forms.unfinished-reminder', idler)).toEqual([])
    await run(NOV_17 + 8 * DAY)
    const told = await toldOf('forms.unfinished-reminder', idler)
    expect(told).toHaveLength(1)
    expect(JSON.parse(told[0]!.payload)).toMatchObject({ form: 'Volunteer sign-up' })
    expect(JSON.parse(told[0]!.payload).link).toContain(`/forms/${slug}`)
    await run(NOV_17 + 20 * DAY)
    expect(await toldOf('forms.unfinished-reminder', idler)).toHaveLength(1)
    expect(await toldOf('forms.unfinished-reminder', sender)).toEqual([])
  })

  it('reminds before the form closes, sends only that one when both are due, and nothing on a paused form', async () => {
    setClock(NOV_17)
    const closing = await offered(definition(question('name')), { closesAt: NOV_17 + 10 * DAY }, { title: 'Auditions' })
    await keep(closing.slug, closer)
    const paused = await offered(definition(question('name')))
    await keep(paused.slug, pauser)
    expect((await req('POST', `/api/forms/forms/${paused.formId}/status`, { to: 'paused' })).status).toBe(200)

    await run(NOV_17 + 6 * DAY)
    expect(await toldOf('forms.closing-reminder', closer)).toEqual([])
    await run(NOV_17 + 8 * DAY)
    const told = await toldOf('forms.closing-reminder', closer)
    expect(told).toHaveLength(1)
    expect(JSON.parse(told[0]!.payload).closes).toMatch(/2026/)
    expect(await toldOf('forms.unfinished-reminder', closer)).toEqual([])
    await run(NOV_17 + 9 * DAY)
    expect(await toldOf('forms.closing-reminder', closer)).toHaveLength(1)
    expect(await toldOf('forms.unfinished-reminder', closer)).toEqual([])
    expect(await toldOf('forms.unfinished-reminder', pauser)).toEqual([])
  })

  it('reminds of the closing date after an earlier reminder of untouched answers', async () => {
    setClock(NOV_17)
    const { slug } = await offered(definition(question('name')), { closesAt: NOV_17 + 30 * DAY })
    await keep(slug, early)
    await run(NOV_17 + 8 * DAY)
    expect(await toldOf('forms.unfinished-reminder', early)).toHaveLength(1)
    await run(NOV_17 + 28 * DAY)
    expect(await toldOf('forms.closing-reminder', early)).toHaveLength(1)
    // Once it has closed, nothing more.
    await run(NOV_17 + 31 * DAY)
    expect(await toldOf('forms.closing-reminder', early)).toHaveLength(1)
  })
})

describe('returned for changes', () => {
  it('reminds once for each time a response is returned and not sent back', async () => {
    setClock(NOV_17)
    const { formId, slug } = await offered(staged(), {}, { title: 'Show proposals' })
    const { responseId, reference } = (await send(slug, { name: 'Ro' }, returner)).body
    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'return')

    await run(NOV_17 + 6 * DAY)
    expect(await toldOf('forms.returned-reminder', returner)).toEqual([])
    await run(NOV_17 + 8 * DAY)
    let told = await toldOf('forms.returned-reminder', returner)
    expect(told).toHaveLength(1)
    expect(JSON.parse(told[0]!.payload)).toMatchObject({ form: 'Show proposals', reference })
    expect(JSON.parse(told[0]!.payload).link).toContain(`/account/forms/${responseId}`)
    await run(NOV_17 + 9 * DAY)
    expect(await toldOf('forms.returned-reminder', returner)).toHaveLength(1)

    // Sent back, and returned again: a second reminder in time, and none once they have sent.
    setClock(NOV_17 + 10 * DAY)
    expect((await req('PUT', `/api/forms/mine/${responseId}`, { answers: { name: 'Ro R' } }, returner)).status).toBe(200)
    await move(formId, responseId, 'return')
    await run(NOV_17 + 12 * DAY)
    expect(await toldOf('forms.returned-reminder', returner)).toHaveLength(1)
    await run(NOV_17 + 18 * DAY)
    told = await toldOf('forms.returned-reminder', returner)
    expect(told).toHaveLength(2)
    setClock(NOV_17 + 19 * DAY)
    await req('PUT', `/api/forms/mine/${responseId}`, { answers: { name: 'Ro R R' } }, returner)
    await run(NOV_17 + 30 * DAY)
    expect(await toldOf('forms.returned-reminder', returner)).toHaveLength(2)
  })
})

describe('reviews still owed', () => {
  it('reminds a reviewer once a round, and not one with a conflict or one who has reviewed', async () => {
    setClock(NOV_17)
    const { formId, slug } = await offered(staged([reviewer.accountId!, other.accountId!, decider.accountId!]))
    const { responseId } = (await send(slug, { name: 'Mo' }, other)).body
    await move(formId, responseId, 'start_review')
    const [given] = await rows<{ id: string }>('SELECT id FROM forms_review_assignments WHERE response_id = ? AND reviewer_id = ?', responseId, decider.accountId)
    expect((await req('PUT', `/api/forms/reviews/${given!.id}`, { vote: 'for' }, decider)).status).toBe(200)

    await run(NOV_17 + 8 * DAY)
    const told = await toldOf('forms.review-reminder', reviewer)
    expect(told).toHaveLength(1)
    const [assignment] = await rows<{ id: string }>('SELECT id FROM forms_review_assignments WHERE response_id = ? AND reviewer_id = ?', responseId, reviewer.accountId)
    expect(JSON.parse(told[0]!.payload).link).toContain(`/account/forms/review/${assignment!.id}`)
    // The sender is conflicted, and the decider has voted.
    expect(await toldOf('forms.review-reminder', other)).toEqual([])
    expect(await toldOf('forms.review-reminder', decider)).toEqual([])
    await run(NOV_17 + 20 * DAY)
    expect(await toldOf('forms.review-reminder', reviewer)).toHaveLength(1)
  })
})
