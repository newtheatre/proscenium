// A quiz for tests: a marked form attached in the quiz slot, and a live course whose first step is it.
import { expect } from 'vitest'
import type { Actor } from '#kit'
import { OPEN, definition, question, req as formsReq } from '../../../forms/tests/integration/stage'
import type { Definition } from '../../../forms/shared/engine'
import { MANAGER, req } from './stage'

export const AUTHOR = [...MANAGER, 'forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.form.mark']

const EXITS = [{ id: 'left', label: 'Stage left' }, { id: 'right', label: 'Stage right' }]
const QUIZ: Definition = {
  ...definition(
    question('exit', { type: 'choice.single', options: EXITS, answer: { correct: ['left'], feedback: { right: 'Yes', wrong: 'Look at the plan' } } }),
    question('alone', { type: 'yesno', answer: { correct: false } }),
  ),
  marking: { passMark: 2, show: 'score' },
}

/** A published form, attached to the course in the quiz slot; with no pass mark when `marked` is false. */
export async function quizForm(author: Actor, courseId: string, marked = true): Promise<string> {
  const formId = (await formsReq('POST', '/api/forms/forms', { title: `Quiz ${Math.random().toString(36).slice(2, 8)}` }, author as any)).body.formId as string
  expect((await formsReq('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365 }, author as any)).status).toBe(200)
  const { body } = await formsReq('GET', `/api/forms/forms/${formId}`, undefined, author as any)
  const def = marked ? QUIZ : { ...QUIZ, marking: undefined }
  const saved = await formsReq('PUT', `/api/forms/forms/${formId}/draft`, { definition: def, editRevision: body.draft.editRevision }, author as any)
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  expect((await formsReq('POST', `/api/forms/forms/${formId}/publish`, { editRevision: saved.body.editRevision }, author as any)).status).toBe(200)
  const attached = await formsReq('PUT', `/api/forms/slots/training.quiz/${courseId}/${formId}`, { ...OPEN, audience: 'signed_in' }, author as any)
  expect(attached.status, JSON.stringify(attached.body)).toBe(200)
  return formId
}

export async function quizCourse(author: Actor, step: Record<string, unknown> = {}, more: unknown[] = []): Promise<{ courseId: string, stepId: string }> {
  const made = await req(author, 'POST', '/api/training/courses', { title: `Quizzed ${Math.random().toString(36).slice(2, 8)}`, expires: true, validFor: 365 * 86_400 })
  const courseId = made.body.courseId
  const formId = await quizForm(author, courseId)
  const saved = await req(author, 'PUT', `/api/training/courses/${courseId}/steps`, { steps: [{ kind: 'quiz', title: 'Fire quiz', formId, maxAttempts: 2, retryAfter: 86_400, ...step }, ...more] })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  const published = await req(author, 'POST', `/api/training/courses/${courseId}/publish`, {})
  expect(published.status, JSON.stringify(published.body)).toBe(200)
  return { courseId, stepId: saved.body.stepIds[0] }
}
