// What a trainer reads in the members' area (training-records part 5, M7 to M9): the courses they may
// sign off, their sessions to mark and to come, and the people part-way through those courses.
import { all, can, nowMs } from '#kit'
import { canonicalAccount } from '#modules/core'
import { courseOrRefuse, listCourses, stepsOf, type Course, type Step } from './courses'
import { theatreDay } from './days'
import { progressOn } from './progress'
import { quizState } from './quizzes'
import { listSessions, type Session } from './sessions'
import type { Actor } from '#kit'

const PART_WAY_SHOWN = 30 // not-policy: how many part-way people a teaching page lists per course

export interface TeachingCourse { id: string, slug: string, title: string, steps: { id: string, title: string, timesRequired: number }[] }
export interface SessionToMark extends Session { unmarked: number }
export interface TriesUsed { accountId: string, name: string | null, courseId: string, courseTitle: string, stepId: string, stepTitle: string, nextTryAt: number }
export interface PartWay { accountId: string, name: string | null, courseId: string, courseTitle: string, slug: string, done: number, of: number }

/** Live courses the actor may sign people off on, by grant or as one of the course's trainers (TR-04). */
export async function coursesITeach(actor: Actor): Promise<Course[]> {
  const out: Course[] = []
  for (const course of await listCourses({ unpublished: false })) {
    if (course.status === 'live' && course.liveVersionId && (await can(actor, 'training.sign-off.record', ['training.course', course.id])).allowed) out.push(course)
  }
  return out
}

async function partWayOn(course: Course): Promise<PartWay[]> {
  const at = nowMs()
  const people = await all<{ accountId: string, name: string | null }>(
    `SELECT s.account_id AS accountId, a.name FROM training_sign_offs s JOIN core_accounts a ON a.id = s.account_id
      WHERE s.course_id = ?1 AND s.kind != 'void' AND a.anonymised_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM training_records r WHERE r.course_id = ?1 AND r.account_id = s.account_id
                          AND r.status = 'awarded' AND (r.expires_at IS NULL OR r.expires_at > ?2))
      GROUP BY s.account_id ORDER BY max(s.created_at) DESC LIMIT ?3` /* not-policy: bound parameters */,
    course.id, at, PART_WAY_SHOWN,
  )
  const out: PartWay[] = []
  for (const p of people) {
    const progress = await progressOn(course, p.accountId)
    if (progress.complete) continue
    out.push({ ...p, courseId: course.id, courseTitle: course.title, slug: course.slug, done: progress.steps.filter(s => s.met).length, of: progress.steps.length })
  }
  return out
}

/** People whose failed tries at a quiz now reach its limit (Q3, TR-45), each confirmed by their quiz state. */
async function triesUsedOn(course: Course, step: Step): Promise<TriesUsed[]> {
  if (step.maxAttempts === null) return []
  const from = nowMs() - (step.retryAfter ?? 0) * 1000 // not-policy: settings are whole seconds
  const people = await all<{ accountId: string, name: string | null }>(
    `SELECT a.account_id AS accountId, acc.name FROM training_quiz_attempts a JOIN core_accounts acc ON acc.id = a.account_id
      WHERE a.step_id = ?1 AND a.kind = 'attempt' AND a.passed = 0 AND a.created_at > ?2 AND acc.anonymised_at IS NULL
        AND a.created_at > coalesce((SELECT max(w.created_at) FROM training_quiz_attempts w WHERE w.account_id = a.account_id AND w.step_id = ?1 AND w.kind = 'allowance'), 0)
      GROUP BY a.account_id HAVING count(*) >= ?3 ORDER BY max(a.created_at) DESC LIMIT ?4` /* not-policy: bound parameters */,
    step.id, from, step.maxAttempts, PART_WAY_SHOWN,
  )
  const out: TriesUsed[] = []
  for (const p of people) {
    const state = await quizState(p.accountId, course.id, step)
    if (state.passed || state.nextTryAt === null) continue
    out.push({ ...p, courseId: course.id, courseTitle: course.title, stepId: step.id, stepTitle: step.title, nextTryAt: state.nextTryAt })
  }
  return out
}

/** M9: a person's progress on the practical steps of a course the reader signs off on. */
export async function practicalProgress(courseId: string, accountId: string) {
  const progress = await progressOn(await courseOrRefuse(courseId), await canonicalAccount(accountId))
  return {
    steps: progress.steps.filter(s => s.kind === 'practical').map(({ stepId, title, needed, done, met }) => ({ stepId, title, needed, done, met })),
    complete: progress.complete,
  }
}

export interface Teaching { today: string, courses: TeachingCourse[], toMark: SessionToMark[], upcoming: Session[], partWay: PartWay[], triesUsed: TriesUsed[] }

/** M7: the trainer's courses with their practical steps (for M9), sessions to mark and to come, people part-way, and tries used up. */
export async function myTeaching(actor: Actor): Promise<Teaching> {
  const at = nowMs()
  const courses = await coursesITeach(actor)
  const out: Teaching = { today: await theatreDay(at), courses: [], toMark: [], upcoming: [], partWay: [], triesUsed: [] }
  for (const course of courses) {
    const steps = await stepsOf(course.liveVersionId!)
    const practical = steps.filter(s => s.kind === 'practical')
    out.courses.push({ id: course.id, slug: course.slug, title: course.title, steps: practical.map(s => ({ id: s.id, title: s.title, timesRequired: s.timesRequired })) })
    for (const quiz of steps.filter(s => s.kind === 'quiz')) out.triesUsed.push(...await triesUsedOn(course, quiz))
    for (const session of await listSessions({ courseId: course.id, from: 0, unpublished: false })) {
      if (session.status !== 'published' || session.attendanceClosedAt !== null) continue
      if (session.startsAt > at) out.upcoming.push(session)
      else out.toMark.push({ ...session, unmarked: await unmarkedOn(session.id) })
    }
    out.partWay.push(...await partWayOn(course))
  }
  out.toMark.sort((a, b) => a.startsAt - b.startsAt)
  out.upcoming.sort((a, b) => a.startsAt - b.startsAt)
  return out
}

async function unmarkedOn(sessionId: string): Promise<number> {
  const [row] = await all<{ n: number }>('SELECT count(*) AS n FROM training_session_places WHERE session_id = ? AND state = \'booked\'', sessionId)
  return row?.n ?? 0
}
