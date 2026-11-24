// Quizzes (amended part 3, Q1 to Q6; TR-42 to TR-45). The answers go to Forms in the caller's unit,
// marked on the server against the version pinned on the step (FB-513); the attempt is inserted with
// the person's failed count as the statement's predicate, so two submissions at once cannot both
// pass the limit, and a refused one leaves no response behind either (Q2, Q3).
import { all, first, newId, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount } from '#modules/core'
import { addResponse, slotFormVersion, slotQuiz } from '#modules/forms'
import { courseOrRefuse, getStep } from './courses'
import { theatreDay } from './days'
import { addSignOff, evaluateAward, progressOn, samePerson } from './progress'

const SECOND = 1000 // not-policy: settings are whole seconds
const SLOT = 'training.quiz'

async function quizStepOrRefuse(courseId: string, stepId: string) {
  const step = await getStep(stepId)
  if (!step || step.courseId !== courseId || step.kind !== 'quiz') refuse('training.step.not-found', 'There is no such quiz on this course.', { status: 404 })
  if (step.versionStatus !== 'live' || !step.formVersionId) refuse('training.step.not-live', 'That quiz is not on the version of the course people take now.', { status: 409 })
  return step
}

/** Failed attempts counted towards the limit (Q3): inside retry_after, and since the latest allowance. */
const FAILED = (scope: string, step: string, from: string) => `(SELECT count(*) FROM training_quiz_attempts a WHERE a.account_id IN (${accountScopeSql(scope)}) AND a.step_id = ${step}
  AND a.kind = 'attempt' AND a.passed = 0 AND a.created_at > ${from}
  AND a.created_at > coalesce((SELECT max(created_at) FROM training_quiz_attempts w WHERE w.account_id IN (${accountScopeSql(scope)}) AND w.step_id = ${step} AND w.kind = 'allowance'), 0))`

export interface QuizState { tries: number | null, used: number, nextTryAt: number | null, passed: boolean }

/** Where the person stands on a quiz: how many tries the limit allows, how many are used, and when the next opens. */
export async function quizState(accountId: string, courseId: string, step: { id: string, maxAttempts: number | null, retryAfter: number | null }): Promise<QuizState> {
  const course = await courseOrRefuse(courseId)
  const progress = await progressOn(course, accountId)
  const passed = !!progress.steps.find(s => s.stepId === step.id)?.met
  const from = nowMs() - (step.retryAfter ?? 0) * SECOND
  const rows = await all<{ createdAt: number }>(
    `SELECT a.created_at AS createdAt FROM training_quiz_attempts a WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.step_id = ?2 AND a.kind = 'attempt' AND a.passed = 0 AND a.created_at > ?3 /* not-policy: bound parameters */
      AND a.created_at > coalesce((SELECT max(created_at) FROM training_quiz_attempts w WHERE w.account_id IN (${accountScopeSql('?1')}) AND w.step_id = ?2 AND w.kind = 'allowance'), 0)
      ORDER BY a.created_at`,
    accountId, step.id, from,
  )
  const full = step.maxAttempts !== null && rows.length >= step.maxAttempts
  return { tries: step.maxAttempts, used: rows.length, nextTryAt: full ? rows[0]!.createdAt + (step.retryAfter ?? 0) * SECOND : null, passed }
}

/** The quiz as the person is sent it: the pinned version's questions without the key (Q4), and where they stand. */
export async function quizFor(actor: Actor, courseId: string, stepId: string) {
  const step = await quizStepOrRefuse(courseId, stepId)
  const quiz = await slotQuiz(SLOT, courseId, step.formId!)
  if (!quiz) refuse('training.quiz.not-available', 'This quiz is not available just now.', { status: 409, remedy: 'Tell whoever runs training.' })
  const { definition, version } = await slotFormVersion(quiz.placementId, step.formVersionId!)
  return { step: { id: step.id, title: step.title, showAnswers: step.showAnswers }, formId: step.formId, version, definition, state: actor.accountId ? await quizState(actor.accountId, courseId, step) : null }
}

export interface QuizResult {
  attemptId: string
  score: number
  outOf: number
  passed: boolean
  /** Which questions were right, with feedback, as the step's show_answers allows (Q4). */
  questions: { questionId: string, correct: boolean, feedback?: string }[]
  recordId: string | null
}

/**
 * Takes the person's answers to a quiz (Q2, Q3, Q5): marked by Forms in this unit against the pinned
 * version, the attempt counted against the limit by the statement, and a pass signing the step off.
 */
export async function submitQuiz(unit: UnitView, actor: Actor, courseId: string, stepId: string, answers: Record<string, unknown>): Promise<QuizResult> {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a live course takes sign-offs.', { status: 409 })
  const step = await quizStepOrRefuse(courseId, stepId)
  const person = await canonicalAccount(actor.accountId)
  const state = await quizState(person, courseId, step)
  if (state.passed) refuse('training.quiz.passed', 'You have already passed this quiz.', { status: 409 })
  if (state.nextTryAt !== null) refuse('training.quiz.limit', 'You have used the tries this quiz allows for now.', { status: 409, remedy: 'Try again later, or ask a trainer of the course for another try.' })
  const sent = await addResponse(unit, { slot: SLOT, subject: courseId, formId: step.formId!, actor, answers: answers as Parameters<typeof addResponse>[1]['answers'], versionId: step.formVersionId! })
  const marking = sent.marking
  if (!marking || marking.passed === null) refuse('training.quiz.not-marked', 'This quiz has no pass mark, so it cannot be taken.', { status: 409, remedy: 'Tell whoever runs training.' })
  const id = newId('tqat')
  const at = nowMs()
  const from = at - (step.retryAfter ?? 0) * SECOND
  unit.add({
    sql: `INSERT INTO training_quiz_attempts (id, account_id, course_id, step_id, kind, response_id, form_version_id, score, out_of, passed, created_at)
      SELECT ?1, ?2, ?3, ?4, 'attempt', ?5, ?6, ?7, ?8, ?9, ?10 WHERE ?11 IS NULL OR ${FAILED('?2', '?4', '?12')} < ?11 /* not-policy: bound parameters */`,
    params: [id, person, courseId, stepId, sent.responseId, step.formVersionId, marking.score, marking.outOf, marking.passed ? 1 : 0, at, step.maxAttempts, from],
  }).expect(1, { code: 'training.quiz.limit', reason: 'You have used the tries this quiz allows for now.', remedy: 'Try again later, or ask a trainer of the course for another try.' })
  unit.announce('training.quiz.attempted', { attemptId: id, accountId: person, courseId, stepId, passed: marking.passed }, { record: ['training.course', courseId] })
  let recordId: string | null = null
  if (marking.passed) {
    const pending = addSignOff(unit, { accountId: person, courseId, stepId, kind: 'quiz', signedBy: null, occurredOn: await theatreDay(at), attemptId: id })
    recordId = await evaluateAward(unit, course, person, [pending])
  }
  const show = step.showAnswers === 'after-each' || (step.showAnswers === 'after-pass' && marking.passed)
  return {
    attemptId: id,
    score: marking.score,
    outOf: marking.outOf,
    passed: marking.passed,
    questions: show ? marking.perQuestion.map(q => ({ questionId: q.questionId, correct: q.correct, ...(q.feedback ? { feedback: q.feedback } : {}) })) : [],
    recordId,
  }
}

/** Allows a person another try now (Q6): by someone who signs off on the course, never for oneself. */
export async function allowAnotherTry(unit: UnitView, actor: Actor, courseId: string, stepId: string, input: { accountId: string, note?: string | null }): Promise<string> {
  await quizStepOrRefuse(courseId, stepId)
  if (await samePerson(actor.accountId, input.accountId)) refuse('training.own-allowance', 'You cannot allow yourself another try.', { status: 403, remedy: 'Ask another trainer of the course.' })
  const person = await canonicalAccount(input.accountId)
  if (!await first('SELECT 1 FROM core_accounts WHERE id = ?', person)) refuse('core.account.not-found', 'There is no such person.', { status: 404 })
  const id = newId('tqat')
  unit.add({
    sql: 'INSERT INTO training_quiz_attempts (id, account_id, course_id, step_id, kind, allowed_by, note, created_at) VALUES (?, ?, ?, ?, \'allowance\', ?, ?, ?)',
    params: [id, person, courseId, stepId, actor.accountId ?? null, input.note ?? null, nowMs()],
  })
  unit.audit({ action: 'create', record: ['training.course', courseId], detail: { allowance: id, account: person, step: stepId } })
  return id
}
