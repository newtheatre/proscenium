// Online lessons and quizzes (TR-39 to TR-45; O1 to O5, Q1 to Q6).
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, type Actor } from '#kit'
import { rows } from '../../../../tests/integration/helpers'
import { DAY, MANAGER, ready, req, someone } from './stage'
import { AUTHOR, quizCourse, quizForm } from './quiz-stage'

beforeEach(ready)

const learner = (name?: string) => someone(['training.course.view'], name)

/** A course whose steps are given, in preparation (version 1), with its step ids. */
async function draftCourse(manager: Actor, steps: unknown[]): Promise<{ courseId: string, stepIds: string[] }> {
  const made = await req(manager, 'POST', '/api/training/courses', { title: `Online ${Math.random().toString(36).slice(2, 8)}`, expires: true, validFor: 365 * 86_400 })
  const saved = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  return { courseId: made.body.courseId, stepIds: saved.body.stepIds }
}

describe('online lessons (TR-39, TR-40; O1, O2, O5)', () => {
  it('opens sections in order, and reaching the last signs off and awards', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await draftCourse(manager, [{ kind: 'lesson', title: 'Fire safety online' }])
    const saved = await req(manager, 'PUT', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections`, {
      sections: [
        { kind: 'content', title: 'Exits', body: 'Know your exits.' },
        { kind: 'content', title: 'Extinguishers', body: 'Which is which.', videoUrl: 'https://videos.example/fire' },
        { kind: 'practice', title: 'Try it', scenarioId: 'fire-drill' },
      ],
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, {})).status).toBe(200)
    const [one, two, three] = saved.body.sectionIds

    const person = await learner()
    const lesson = await req(person, 'GET', `/api/training/courses/${courseId}/steps/${stepIds[0]}/lesson`)
    expect(lesson.body.sections.map((x: any) => x.open)).toEqual([true, false, false])
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections/${two}/reached`, {})).body.code).toBe('training.section.not-open')
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections/${one}/reached`, {})).body).toMatchObject({ done: false })
    // Reaching the same section again records nothing new.
    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections/${one}/reached`, {})
    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections/${two}/reached`, {})
    const last = await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections/${three}/reached`, {})
    expect(last.status, JSON.stringify(last.body)).toBe(200)
    expect(last.body.done).toBe(true)
    expect(last.body.recordId).toMatch(/^trec_/)
    expect(await rows('SELECT kind FROM training_sign_offs WHERE account_id = ?', person.accountId)).toEqual([{ kind: 'lesson' }])
  })

  it('freezes a published lesson, and copies its sections into the next version carrying from them', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await draftCourse(manager, [{ kind: 'lesson', title: 'Bar basics' }])
    await req(manager, 'PUT', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections`, { sections: [{ kind: 'content', title: 'Pouring', body: 'Slowly.' }] })
    // Saving the steps again keeps the lesson's sections.
    await req(manager, 'PUT', `/api/training/courses/${courseId}/steps`, { steps: [{ id: stepIds[0], kind: 'lesson', title: 'Bar basics' }, { kind: 'reading', title: 'The licence' }] })
    expect(await rows('SELECT title FROM training_lesson_sections WHERE step_id = ?', stepIds[0])).toEqual([{ title: 'Pouring' }])
    await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, {})
    const frozen = await req(manager, 'PUT', `/api/training/courses/${courseId}/steps/${stepIds[0]}/sections`, { sections: [{ kind: 'content', title: 'Changed' }] })
    expect(frozen.body.code).toBe('training.version-published')

    await req(manager, 'POST', `/api/training/courses/${courseId}/versions`, {})
    const copied = await rows<any>(`SELECT x.title, x.carries_section_id FROM training_lesson_sections x JOIN training_course_steps s ON s.id = x.step_id
      JOIN training_course_versions v ON v.id = s.version_id WHERE v.course_id = ? AND v.number = 2`, courseId)
    const [original] = await rows<{ id: string }>('SELECT id FROM training_lesson_sections WHERE step_id = ?', stepIds[0])
    expect(copied).toEqual([{ title: 'Pouring', carries_section_id: original!.id }])
  })
})

describe('quizzes (TR-42 to TR-45; Q1 to Q6)', () => {
  it('refuses to publish a quiz whose form has no pass mark (Q1)', async () => {
    const author = await someone(AUTHOR)
    const made = await req(author, 'POST', '/api/training/courses', { title: 'Unmarked', expires: false })
    const formId = await quizForm(author, made.body.courseId, false)
    await req(author, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [{ kind: 'quiz', title: 'Quiz', formId }] })
    const refused = await req(author, 'POST', `/api/training/courses/${made.body.courseId}/publish`, {})
    expect(refused.status).toBe(422)
    expect(refused.body.code).toBe('training.quiz.not-marked')
  })

  it('marks on the server, limits failed tries, takes an allowance, and a pass signs the step off once', async () => {
    const author = await someone(AUTHOR, 'Tess Trainer')
    const { courseId, stepId } = await quizCourse(author, {}, [{ kind: 'practical', title: 'Show it on the night' }])
    const person = await learner()
    const read = await req(person, 'GET', `/api/training/courses/${courseId}/steps/${stepId}/quiz`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(JSON.stringify(read.body.definition)).not.toMatch(/"answer"|passMark/)
    expect(read.body.state).toMatchObject({ tries: 2, used: 0, passed: false })

    const wrong = { exit: 'right', alone: true }
    const first = await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: wrong })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    // After a fail, show_answers after-pass shows the score only.
    expect(first.body).toMatchObject({ score: 0, outOf: 2, passed: false, questions: [], recordId: null })
    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: wrong })
    const responses = (await rows('SELECT 1 FROM forms_responses WHERE subject_id = ?', courseId)).length
    const third = await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'left', alone: false } })
    expect(third.status).toBe(409)
    expect(third.body.code).toBe('training.quiz.limit')
    expect(await rows('SELECT 1 FROM forms_responses WHERE subject_id = ?', courseId)).toHaveLength(responses)

    expect((await req(author, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/allowances`, { accountId: author.accountId })).body.code).toBe('training.own-allowance')
    expect((await req(author, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/allowances`, { accountId: person.accountId, note: 'Talked it through' })).status).toBe(200)
    const pass = await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'left', alone: false } })
    expect(pass.status, JSON.stringify(pass.body)).toBe(200)
    expect(pass.body).toMatchObject({ score: 2, outOf: 2, passed: true })
    expect(pass.body.questions).toEqual([{ questionId: 'exit', correct: true, feedback: 'Yes' }, { questionId: 'alone', correct: true }])
    expect(pass.body.recordId).toBeNull()
    expect(await rows('SELECT kind, attempt_id FROM training_sign_offs WHERE account_id = ?', person.accountId)).toEqual([{ kind: 'quiz', attempt_id: pass.body.attemptId }])
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'left', alone: false } })).body.code).toBe('training.quiz.passed')
  })

  it('opens another try once retry_after has passed', async () => {
    const author = await someone(AUTHOR)
    const { courseId, stepId } = await quizCourse(author, { maxAttempts: 1 })
    const person = await learner()
    await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'right', alone: true } })
    expect((await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'right', alone: true } })).body.code).toBe('training.quiz.limit')
    advanceClock(DAY + 1000)
    const passed = await req(person, 'POST', `/api/training/courses/${courseId}/steps/${stepId}/quiz`, { answers: { exit: 'left', alone: false } })
    expect(passed.body).toMatchObject({ passed: true, recordId: expect.stringMatching(/^trec_/) })
  })
})
