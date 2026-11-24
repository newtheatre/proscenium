// A trainer's own work in the members' area (M7 to M9): the courses they train, sessions to mark and
// to come, people part-way through, quiz tries used up, and the people search for signing off.
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, nowMs, type Actor } from '#kit'
import { rows } from '../../../../tests/integration/helpers'
import { DAY, MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'
import { AUTHOR, quizCourse } from './quiz-stage'

beforeEach(ready)

const HOUR = 3_600_000
const fresh = (actor: Actor): Actor => ({ ...actor, reassertedAt: nowMs() }) as Actor

async function trainerOf(courseId: string, name = 'Tess Trainer'): Promise<Actor> {
  const trainer = await someone(['training.course.view'], name)
  await rows('INSERT INTO training_course_trainers (course_id, account_id, added_at) VALUES (?, ?, 0)', courseId, trainer.accountId)
  // The test access provider maps no facts, so the course-trainer fact's default abilities come as grants at the course.
  const at = { type: 'training.course', id: courseId }
  return { ...trainer, grants: [...trainer.grants!, { ability: 'training.sign-off.record', via: 'fact', record: at }, { ability: 'training.session.run', via: 'fact', record: at }] } as Actor
}

describe('teaching (M7)', () => {
  it('shows only the courses the person trains, with their practical steps', async () => {
    const manager = await someone(MANAGER)
    const mine = await liveCourse(manager, [{ kind: 'practical', title: 'Cash up', timesRequired: 2 }, { kind: 'reading', title: 'Read the guide', materialUrl: 'https://example.org' }])
    const other = await liveCourse(manager)
    const trainer = await trainerOf(mine.courseId)

    const seen = await req(trainer, 'GET', '/api/training/teaching')
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.today).toBe('2026-11-24')
    const ids = seen.body.courses.map((c: any) => c.id)
    expect(ids).toContain(mine.courseId)
    expect(ids).not.toContain(other.courseId)
    expect(seen.body.courses.find((c: any) => c.id === mine.courseId).steps).toEqual([{ id: mine.stepIds[0], title: 'Cash up', timesRequired: 2 }])

    // Someone who trains nothing has no teaching page.
    const nobody = await someone(['training.course.view'])
    expect((await req(nobody, 'GET', '/api/training/teaching')).status).toBe(403)
  })

  it('lists sessions to mark once they start and sessions to come, and drops a session once attendance closes', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    const trainer = await trainerOf(courseId)
    const made = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 + DAY, endsAt: NOV_24 + DAY + 2 * HOUR, capacity: 4 })
    await req(manager, 'POST', `/api/training/sessions/${made.body.sessionId}/publish`, {})
    const learner = await someone(['training.course.view', 'training.place.book'])
    await req(learner, 'POST', `/api/training/sessions/${made.body.sessionId}/places`, {})

    let seen = (await req(trainer, 'GET', '/api/training/teaching')).body
    expect(seen.upcoming.map((s: any) => s.id)).toContain(made.body.sessionId)
    expect(seen.toMark.map((s: any) => s.id)).not.toContain(made.body.sessionId)

    advanceClock(DAY + HOUR)
    seen = (await req(fresh(trainer), 'GET', '/api/training/teaching')).body
    expect(seen.toMark.find((s: any) => s.id === made.body.sessionId)).toMatchObject({ unmarked: 1 })
    expect(seen.upcoming.map((s: any) => s.id)).not.toContain(made.body.sessionId)

    const [place] = await rows<{ id: string }>('SELECT id FROM training_session_places WHERE session_id = ?', made.body.sessionId)
    expect((await req(fresh(trainer), 'PUT', `/api/training/sessions/${made.body.sessionId}/attendance`, { marks: [{ placeId: place!.id, state: 'attended' }] })).status).toBe(200)
    expect((await req(fresh(trainer), 'POST', `/api/training/sessions/${made.body.sessionId}/close`, {})).status).toBe(200)
    seen = (await req(fresh(trainer), 'GET', '/api/training/teaching')).body
    expect(seen.toMark.map((s: any) => s.id)).not.toContain(made.body.sessionId)
  })

  it('lists people part-way through the courses, and leaves out those who now hold it', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, [{ kind: 'practical', title: 'Cash up', timesRequired: 2 }])
    const trainer = await trainerOf(courseId)
    const learner = await someone(['training.course.view'], 'Priya Shah')
    const signed = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)

    let seen = (await req(trainer, 'GET', '/api/training/teaching')).body
    expect(seen.partWay.find((p: any) => p.accountId === learner.accountId)).toMatchObject({ name: 'Priya Shah', courseId, done: 0, of: 1 })

    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
    seen = (await req(trainer, 'GET', '/api/training/teaching')).body
    expect(seen.partWay.some((p: any) => p.accountId === learner.accountId)).toBe(false)
  })
})

describe('quiz tries used up (M7, TR-45)', () => {
  it('lists people who used their tries, with when the next opens, until a trainer allows another', async () => {
    const author = await someone(AUTHOR)
    const { courseId, stepId } = await quizCourse(author, { maxAttempts: 1 })
    const trainer = await trainerOf(courseId)
    const learner = await someone(['training.course.view'], 'Mei Lin Chen')
    await req(learner, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'right', alone: true } })

    let seen = (await req(trainer, 'GET', '/api/training/teaching')).body
    expect(seen.triesUsed).toEqual([{ accountId: learner.accountId, name: 'Mei Lin Chen', courseId, courseTitle: expect.any(String), stepId, stepTitle: 'Fire quiz', nextTryAt: NOV_24 + DAY }])

    expect((await req(trainer, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/allowances`, { accountId: learner.accountId })).status).toBe(200)
    seen = (await req(trainer, 'GET', '/api/training/teaching')).body
    expect(seen.triesUsed).toEqual([])
  })
})

describe('a person\'s progress for signing off (M9)', () => {
  it('shows a trainer how many times each practical step is done, and refuses a course they do not train', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, [{ kind: 'practical', title: 'Run a till', timesRequired: 2 }, { kind: 'practical', title: 'Cash up' }])
    const other = await liveCourse(manager)
    const trainer = await trainerOf(courseId)
    const learner = await someone(['training.course.view'], 'Priya Shah')
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })

    const seen = await req(trainer, 'GET', `/api/training/teaching/progress?courseId=${courseId}&accountId=${learner.accountId}`)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.steps).toEqual([
      { stepId: stepIds[0], title: 'Run a till', needed: 2, done: 1, met: false },
      { stepId: stepIds[1], title: 'Cash up', needed: 1, done: 0, met: false },
    ])
    expect(seen.body.complete).toBe(false)
    expect((await req(trainer, 'GET', `/api/training/teaching/progress?courseId=${other.courseId}&accountId=${learner.accountId}`)).status).toBe(403)
  })
})

describe('signing someone off (M9)', () => {
  it('finds people by name for a trainer, and refuses someone who trains nothing', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager)
    const trainer = await trainerOf(courseId)
    await someone([], 'Quentin Quarrington')

    const found = await req(trainer, 'GET', '/api/training/teaching/people?q=Quarrington')
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people.map((p: any) => p.name)).toContain('Quentin Quarrington')

    const nobody = await someone(['training.course.view'])
    expect((await req(nobody, 'GET', '/api/training/teaching/people?q=Quarrington')).status).toBe(403)
  })
})
