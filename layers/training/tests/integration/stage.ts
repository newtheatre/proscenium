// Shared set-up for Training's tests: the module on, the theatre's time zone set, accounts that
// exist, and routes called as a person would call them.
import { expect } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import listCourses from '../../server/api/training/courses/index.get'
import createCourse from '../../server/api/training/courses/index.post'
import getCourse from '../../server/api/training/courses/[id]/index.get'
import patchCourse from '../../server/api/training/courses/[id]/index.patch'
import putSteps from '../../server/api/training/courses/[id]/steps.put'
import startVersion from '../../server/api/training/courses/[id]/versions.post'
import publish from '../../server/api/training/courses/[id]/publish.post'
import retire from '../../server/api/training/courses/[id]/retire.post'
import revive from '../../server/api/training/courses/[id]/revive.post'
import addTrainer from '../../server/api/training/courses/[id]/trainers/index.post'
import removeTrainer from '../../server/api/training/courses/[id]/trainers/[account].delete'
import signOff from '../../server/api/training/courses/[id]/sign-offs.post'
import award from '../../server/api/training/courses/[id]/awards.post'
import progress from '../../server/api/training/courses/[id]/progress.get'
import opened from '../../server/api/training/courses/[id]/steps/[step]/opened.post'
import read from '../../server/api/training/courses/[id]/steps/[step]/read.post'
import voidSignOff from '../../server/api/training/sign-offs/[id]/void.post'
import revoke from '../../server/api/training/records/[id]/revoke.post'
import myRecords from '../../server/api/training/me/records.get'
import personRecords from '../../server/api/training/people/[id]/records.get'
import listCompetencies from '../../server/api/training/competencies/index.get'
import createCompetency from '../../server/api/training/competencies/index.post'
import getCompetency from '../../server/api/training/competencies/[id]/index.get'
import patchCompetency from '../../server/api/training/competencies/[id]/index.patch'
import putRoutes from '../../server/api/training/competencies/[id]/routes.put'
import activate from '../../server/api/training/competencies/[id]/activate.post'
import retireCompetency from '../../server/api/training/competencies/[id]/retire.post'
import myCompetencies from '../../server/api/training/me/competencies.get'
import myCompetency from '../../server/api/training/me/competencies/[slug].get'
import createSession from '../../server/api/training/courses/[id]/sessions.post'
import listSessions from '../../server/api/training/sessions/index.get'
import getSession from '../../server/api/training/sessions/[id]/index.get'
import patchSession from '../../server/api/training/sessions/[id]/index.patch'
import publishSession from '../../server/api/training/sessions/[id]/publish.post'
import cancelSession from '../../server/api/training/sessions/[id]/cancel.post'
import bookPlace from '../../server/api/training/sessions/[id]/places.post'
import markAttendance from '../../server/api/training/sessions/[id]/attendance.put'
import walkIn from '../../server/api/training/sessions/[id]/walk-ins.post'
import closeSession from '../../server/api/training/sessions/[id]/close.post'
import cancelPlace from '../../server/api/training/places/[id]/cancel.post'
import myPlaces from '../../server/api/training/me/places.get'
import putSections from '../../server/api/training/courses/[id]/steps/[step]/sections.put'
import getLesson from '../../server/api/training/courses/[id]/steps/[step]/lesson.get'
import reached from '../../server/api/training/courses/[id]/steps/[step]/sections/[section]/reached.post'
import getQuiz from '../../server/api/training/courses/[id]/steps/[step]/quiz.get'
import sendQuiz from '../../server/api/training/courses/[id]/steps/[step]/quiz.post'
import allowance from '../../server/api/training/courses/[id]/steps/[step]/allowances.post'
import readActivity from '../../server/api/training/courses/[id]/activity.post'
import stepSources from '../../server/api/training/step-sources.get'
import evidenceFile from '../../server/api/training/courses/[id]/steps/[step]/evidence-file.post'
import submitEvidence from '../../server/api/training/courses/[id]/evidence/index.post'
import seen from '../../server/api/training/courses/[id]/evidence/seen.post'
import evidenceQueue from '../../server/api/training/evidence/index.get'
import getEvidence from '../../server/api/training/evidence/[id]/index.get'
import verifyEvidence from '../../server/api/training/evidence/[id]/verify.post'
import rejectEvidence from '../../server/api/training/evidence/[id]/reject.post'
import withdrawEvidence from '../../server/api/training/evidence/[id]/withdraw.post'
import myEvidence from '../../server/api/training/me/evidence.get'
import catalogue from '../../server/api/training/catalogue.get'
import myTraining from '../../server/api/training/me/index.get'
import myCourse from '../../server/api/training/me/courses/[slug].get'

export const training = server({
  'GET /api/training/courses': listCourses,
  'POST /api/training/courses': createCourse,
  'GET /api/training/courses/:id': getCourse,
  'PATCH /api/training/courses/:id': patchCourse,
  'PUT /api/training/courses/:id/steps': putSteps,
  'POST /api/training/courses/:id/versions': startVersion,
  'POST /api/training/courses/:id/publish': publish,
  'POST /api/training/courses/:id/retire': retire,
  'POST /api/training/courses/:id/revive': revive,
  'POST /api/training/courses/:id/trainers': addTrainer,
  'DELETE /api/training/courses/:id/trainers/:account': removeTrainer,
  'POST /api/training/courses/:id/sign-offs': signOff,
  'POST /api/training/courses/:id/awards': award,
  'GET /api/training/courses/:id/progress': progress,
  'POST /api/training/courses/:id/steps/:step/opened': opened,
  'POST /api/training/courses/:id/steps/:step/read': read,
  'POST /api/training/sign-offs/:id/void': voidSignOff,
  'POST /api/training/records/:id/revoke': revoke,
  'GET /api/training/me/records': myRecords,
  'GET /api/training/people/:id/records': personRecords,
  'GET /api/training/competencies': listCompetencies,
  'POST /api/training/competencies': createCompetency,
  'GET /api/training/competencies/:id': getCompetency,
  'PATCH /api/training/competencies/:id': patchCompetency,
  'PUT /api/training/competencies/:id/routes': putRoutes,
  'POST /api/training/competencies/:id/activate': activate,
  'POST /api/training/competencies/:id/retire': retireCompetency,
  'GET /api/training/me/competencies': myCompetencies,
  'GET /api/training/me/competencies/:slug': myCompetency,
  'POST /api/training/courses/:id/sessions': createSession,
  'GET /api/training/sessions': listSessions,
  'GET /api/training/sessions/:id': getSession,
  'PATCH /api/training/sessions/:id': patchSession,
  'POST /api/training/sessions/:id/publish': publishSession,
  'POST /api/training/sessions/:id/cancel': cancelSession,
  'POST /api/training/sessions/:id/places': bookPlace,
  'PUT /api/training/sessions/:id/attendance': markAttendance,
  'POST /api/training/sessions/:id/walk-ins': walkIn,
  'POST /api/training/sessions/:id/close': closeSession,
  'POST /api/training/places/:id/cancel': cancelPlace,
  'GET /api/training/me/places': myPlaces,
  'PUT /api/training/courses/:id/steps/:step/sections': putSections,
  'GET /api/training/courses/:id/steps/:step/lesson': getLesson,
  'POST /api/training/courses/:id/steps/:step/sections/:section/reached': reached,
  'GET /api/training/courses/:id/steps/:step/quiz': getQuiz,
  'POST /api/training/courses/:id/steps/:step/quiz': sendQuiz,
  'POST /api/training/courses/:id/steps/:step/allowances': allowance,
  'POST /api/training/courses/:id/activity': readActivity,
  'GET /api/training/step-sources': stepSources,
  'POST /api/training/courses/:id/steps/:step/evidence-file': evidenceFile,
  'POST /api/training/courses/:id/evidence': submitEvidence,
  'POST /api/training/courses/:id/evidence/seen': seen,
  'GET /api/training/evidence': evidenceQueue,
  'GET /api/training/evidence/:id': getEvidence,
  'POST /api/training/evidence/:id/verify': verifyEvidence,
  'POST /api/training/evidence/:id/reject': rejectEvidence,
  'POST /api/training/evidence/:id/withdraw': withdrawEvidence,
  'GET /api/training/me/evidence': myEvidence,
  'GET /api/training/catalogue': catalogue,
  'GET /api/training/me': myTraining,
  'GET /api/training/me/courses/:slug': myCourse,
})

/** 24 November 2026, 10:00 in London. */
export const NOV_24 = Date.UTC(2026, 10, 24, 10)
export const DAY = 86_400_000

export async function ready(): Promise<void> {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('forms', true)
  await setModule('occupancy', true)
  await setModule('training', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}

export interface Answer<T = any> { status: number, body: T }

export async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<Answer<T>> {
  const response = await call(training, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

/** A person with an account row, holding these abilities site-wide. */
export async function someone(abilities: string[] = [], name = 'Sam Learner'): Promise<Actor> {
  const who = person(abilities)
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, name, NOV_24, NOV_24)
  return who
}

export const MANAGER = ['training.competency.manage', 'training.session.manage', 'training.session.run', 'training.place.manage', 'training.place.book', 'training.course.manage', 'training.course.view', 'training.record.view', 'training.sign-off.record', 'training.record.award', 'training.record.revoke']

let n = 0
/** A course published with the steps given (by default one practical step), valid for a year. */
export async function liveCourse(manager: Actor, steps: unknown[] = [{ kind: 'practical', title: 'Show you can do it' }], fields: Record<string, unknown> = {}): Promise<{ courseId: string, stepIds: string[] }> {
  const made = await req(manager, 'POST', '/api/training/courses', { title: `Course ${++n}`, expires: true, validFor: 365 * 86_400, ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const saved = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  const published = await req(manager, 'POST', `/api/training/courses/${made.body.courseId}/publish`, {})
  expect(published.status, JSON.stringify(published.body)).toBe(200)
  return { courseId: made.body.courseId, stepIds: saved.body.stepIds }
}

export const today = '2026-11-24'
