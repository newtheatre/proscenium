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
})

/** 24 November 2026, 10:00 in London. */
export const NOV_24 = Date.UTC(2026, 10, 24, 10)
export const DAY = 86_400_000

export async function ready(): Promise<void> {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('forms', true)
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

export const MANAGER = ['training.course.manage', 'training.course.view', 'training.record.view', 'training.sign-off.record', 'training.record.award', 'training.record.revoke']

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
