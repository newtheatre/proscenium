// What a learner reads in the members' area (M1 to M5): the catalogue with their own standing, one
// course with an action per step, their training at a glance, and the times on a session.
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, nowMs, type Actor } from '#kit'
import { DAY, MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'

beforeEach(ready)

const HOUR = 3_600_000
const learner = (name?: string) => someone(['training.course.view', 'training.place.book'], name)
const fresh = (actor: Actor): Actor => ({ ...actor, reassertedAt: nowMs() }) as Actor
const TWO_STEPS = [{ kind: 'practical', title: 'Count a float' }, { kind: 'reading', title: 'Read the till guide', materialUrl: 'https://example.org/till' }]

async function slugOf(manager: Actor, courseId: string): Promise<string> {
  return (await req(manager, 'GET', `/api/training/courses/${courseId}`)).body.course.slug
}

describe('the catalogue (M2)', () => {
  it('lists live courses only, each with its ways to learn and the reader\'s own status', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, TWO_STEPS)
    const draft = await req(manager, 'POST', '/api/training/courses', { title: 'Not yet', expires: false })
    const person = await learner()

    let rows = (await req(person, 'GET', '/api/training/catalogue')).body.courses as any[]
    expect(rows.some(c => c.id === draft.body.courseId)).toBe(false)
    let mine = rows.find(c => c.id === courseId)
    expect(mine.ways).toEqual(['in-person', 'online'])
    expect(mine.mine).toMatchObject({ status: 'not-started', done: 0, of: 2 })

    await req(manager, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: person.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
    rows = (await req(person, 'GET', '/api/training/catalogue')).body.courses
    mine = rows.find(c => c.id === courseId)
    expect(mine.mine).toMatchObject({ status: 'in-progress', done: 1, of: 2 })

    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[1]}/opened`, {})
    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[1]}/read`, {})
    rows = (await req(person, 'GET', '/api/training/catalogue')).body.courses
    expect(rows.find(c => c.id === courseId).mine.status).toBe('current')
  })
})

describe('a course as a learner sees it (M3)', () => {
  it('gives each step the reader\'s progress and an action by kind, with the sessions to come and what changed', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }, ...TWO_STEPS])
    await req(manager, 'POST', `/api/training/courses/${courseId}/versions`, {})
    await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, { changeKind: 'records-stand', changeNote: 'Clearer wording' })
    const made = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 + 3 * DAY, endsAt: NOV_24 + 3 * DAY + 2 * HOUR, capacity: 4 })
    await req(manager, 'POST', `/api/training/sessions/${made.body.sessionId}/publish`, {})
    await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 + 4 * DAY, endsAt: NOV_24 + 4 * DAY + HOUR })
    const person = await learner()

    const seen = await req(person, 'GET', `/api/training/me/courses/${await slugOf(manager, courseId)}`)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.steps.map((s: any) => s.action.kind)).toEqual(['session', 'trainer', 'reading'])
    expect(seen.body.steps[2].action.materialUrl).toBe('https://example.org/till')
    expect(seen.body.steps[0].action).toEqual({ kind: 'session' })
    expect(seen.body.steps.every((s: any) => !s.met && s.needed === 1)).toBe(true)
    // Only the published session, with its places left.
    expect(seen.body.sessions).toHaveLength(1)
    expect(seen.body.sessions[0]).toMatchObject({ id: made.body.sessionId, placesLeft: 4 })
    expect(seen.body.changes.map((c: any) => c.number)).toEqual([2, 1])
    expect(seen.body.changes[0].changeNote).toBe('Clearer wording')
    expect(seen.body.mine.status).toBe('not-started')
    expect(stepIds).toHaveLength(3)
  })

  it('refuses a course that does not exist or is not published', async () => {
    const manager = await someone(MANAGER)
    const draft = await req(manager, 'POST', '/api/training/courses', { title: 'Hidden course', expires: false })
    const person = await learner()
    expect((await req(person, 'GET', '/api/training/me/courses/no-such-course')).status).toBe(404)
    expect((await req(person, 'GET', `/api/training/me/courses/${await slugOf(manager, draft.body.courseId)}`)).status).toBe(404)
  })
})

describe('my training (M1, M5)', () => {
  it('lists what the person holds, what they are part-way through and evidence turned down', async () => {
    const manager = await someone([...MANAGER, 'training.evidence.verify'])
    const held = await liveCourse(manager, undefined, { validFor: 60 * 86_400 })
    const partly = await liveCourse(manager, TWO_STEPS)
    const certificate = await liveCourse(manager, [{ kind: 'certificate', title: 'First aid', evidenceExpiry: 'none', evidenceFile: 'optional' }])
    const person = await learner()
    await req(manager, 'POST', `/api/training/courses/${held.courseId}/sign-offs`, { accountId: person.accountId, stepId: held.stepIds[0], occurredOn: '2026-11-24' })
    await req(manager, 'POST', `/api/training/courses/${partly.courseId}/sign-offs`, { accountId: person.accountId, stepId: partly.stepIds[0], occurredOn: '2026-11-24' })
    const sent = await req(person, 'POST', `/api/training/courses/${certificate.courseId}/evidence`, { stepId: certificate.stepIds[0], issuer: 'Red Cross', issuedOn: '2026-01-10' })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    const rejected = await req(manager, 'POST', `/api/training/evidence/${sent.body.evidenceId}/reject`, { reason: 'The date cannot be read' })
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200)

    let mine = (await req(person, 'GET', '/api/training/me')).body
    expect(mine.records.map((r: any) => [r.courseId, r.myStatus])).toEqual([[held.courseId, 'current']])
    expect(mine.inProgress).toEqual([expect.objectContaining({ courseId: partly.courseId, done: 1, of: 2 })])
    expect(mine.notApproved).toEqual([expect.objectContaining({ courseId: certificate.courseId, reason: 'The date cannot be read' })])
    expect(mine.warnBefore).toBe(30 * DAY)

    expect(mine.records[0].nextSession).toBeNull()
    const renewal = await req(manager, 'POST', `/api/training/courses/${held.courseId}/sessions`, { startsAt: NOV_24 + 45 * DAY, endsAt: NOV_24 + 45 * DAY + HOUR, capacity: 3 })
    await req(manager, 'POST', `/api/training/sessions/${renewal.body.sessionId}/publish`, {})

    // Inside the warning period the record reads as expiring, with the session to renew it; a fresh certificate clears the refusal.
    advanceClock(40 * DAY)
    const again = await req(fresh(person), 'POST', `/api/training/courses/${certificate.courseId}/evidence`, { stepId: certificate.stepIds[0], issuer: 'Red Cross', issuedOn: '2026-01-10' })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    mine = (await req(fresh(person), 'GET', '/api/training/me')).body
    expect(mine.records[0].myStatus).toBe('expiring')
    expect(mine.records[0].nextSession).toEqual({ id: renewal.body.sessionId, startsAt: NOV_24 + 45 * DAY, placesLeft: 3 })
    expect(mine.notApproved).toEqual([])
  })

  it('shows another person nothing of anyone else\'s', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager)
    const person = await learner()
    await req(manager, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: person.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
    const other = (await req(await learner(), 'GET', '/api/training/me')).body
    expect(other.records).toEqual([])
    expect(other.inProgress).toEqual([])
  })
})

describe('a session\'s times (M4)', () => {
  it('gives the sign-up and cancel deadlines, the place in line, and the next session when full', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    const start = NOV_24 + 3 * DAY
    const first = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: start, endsAt: start + HOUR, capacity: 1 })
    await req(manager, 'POST', `/api/training/sessions/${first.body.sessionId}/publish`, {})
    const later = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: start + 7 * DAY, endsAt: start + 7 * DAY + HOUR })
    await req(manager, 'POST', `/api/training/sessions/${later.body.sessionId}/publish`, {})
    const [a, b, c] = [await learner('Ann'), await learner('Bea'), await learner('Cat')]
    for (const p of [a, b, c]) expect((await req(p, 'POST', `/api/training/sessions/${first.body.sessionId}/places`, {})).status).toBe(200)

    const seen = (await req(c, 'GET', `/api/training/sessions/${first.body.sessionId}`)).body
    expect(seen.mine.state).toBe('waiting')
    expect(seen.times).toEqual({ signUpClosesAt: start - 2 * HOUR, cancelUntil: start - 24 * HOUR, waitingList: true, position: 2, next: { id: later.body.sessionId, startsAt: start + 7 * DAY } })
    expect((await req(a, 'GET', `/api/training/sessions/${first.body.sessionId}`)).body.times.position).toBeNull()
  })
})
