// What a learner reads in the members' area (second-round part 5, M1 to M5; amended part 5, M1 to
// M3): the catalogue with their own standing on each course, one course with an action per step,
// and their training at a glance. Only ever the caller's rows.
import { all, first, nowMs, refuse, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { waysToLearn, type StepKind, type Way } from '../shared/states'
import { getCourse, stepsOf, type Course, type Step } from './courses'
import { lessonFor } from './lessons'
import { progressOn, recordsOf, type RecordView } from './progress'
import { quizState } from './quizzes'
import { listSessions, placeFor, placesOfPerson, type Session } from './sessions'
import { stepSource } from './sources'
import type { Actor } from '#kit'

const SECOND = 1000 // not-policy: settings are whole seconds

/** Where the person stands on a course, in the words a badge shows (part 5, "Status words"). */
export type MyStatus = 'current' | 'expiring' | 'ends-early' | 'lapsed' | 'revoked' | 'in-progress' | 'not-started'

export interface MyCourse {
  status: MyStatus
  record: Pick<RecordView, 'id' | 'awardedAt' | 'expiresAt' | 'standing' | 'cutReason'> | null
  done: number
  of: number
}

function statusOf(record: RecordView | undefined, done: number): MyStatus {
  if (record?.standing === 'current' || record?.standing === 'expiring') return record.cutReason ? 'ends-early' : record.standing
  if (record?.standing === 'lapsed' || record?.standing === 'revoked') return done ? 'in-progress' : record.standing
  return done ? 'in-progress' : 'not-started'
}

async function mine(course: Course, accountId: string, records: RecordView[]): Promise<MyCourse> {
  const record = records.find(r => r.courseId === course.id && r.standing !== 'superseded')
  const progress = course.liveVersionId ? await progressOn(course, accountId) : null
  const done = progress?.steps.filter(s => s.met).length ?? 0
  const held = record?.standing === 'current' || record?.standing === 'expiring'
  return {
    status: statusOf(record, held ? 0 : done),
    record: record ? { id: record.id, awardedAt: record.awardedAt, expiresAt: record.expiresAt, standing: record.standing, cutReason: record.cutReason } : null,
    done,
    of: progress?.steps.length ?? 0,
  }
}

export interface CatalogueRow { id: string, slug: string, title: string, summary: string | null, ways: Way[], mine: MyCourse | null }

/** M2: live courses, each with its ways to learn and the person's own standing. */
export async function catalogue(accountId: string | undefined): Promise<CatalogueRow[]> {
  const courses = (await all<{ id: string }>('SELECT id FROM training_courses WHERE status = \'live\' ORDER BY lower(title)'))
  const records = accountId ? await recordsOf(accountId) : []
  const out: CatalogueRow[] = []
  for (const { id } of courses) {
    const course = (await getCourse(id))!
    const kinds = course.liveVersionId ? (await stepsOf(course.liveVersionId)).map(s => s.kind) : []
    out.push({ id, slug: course.slug, title: course.title, summary: course.summary, ways: waysToLearn(kinds), mine: accountId ? await mine(course, accountId, records) : null })
  }
  return out
}

/** What the person does next on a step, by its kind (amended part 5, M3). */
export type StepAction
  = | { kind: 'session' }
    | { kind: 'trainer' }
    | { kind: 'reading', materialUrl: string | null, materialFileId: string | null }
    | { kind: 'lesson', reached: number, sections: number }
    | { kind: 'quiz', tries: number | null, used: number, nextTryAt: number | null }
    | { kind: 'certificate' | 'declaration', waiting: boolean, lastReason: string | null, expiry: Step['evidenceExpiry'], file: Step['evidenceFile'], qualifications: NonNullable<Step['qualifications']>, otherQualification: boolean, hasQuestions: boolean }
    | { kind: 'activity', source: string | null }

export interface MyStep {
  id: string
  position: number
  title: string
  kind: StepKind
  guidance: string | null
  needed: number
  done: number
  met: boolean
  action: StepAction
}

async function actionFor(actor: Actor, course: Course, step: Step): Promise<StepAction> {
  const accountId = actor.accountId
  switch (step.kind) {
    case 'session': return { kind: 'session' }
    case 'practical': return { kind: 'trainer' }
    case 'reading': return { kind: 'reading', materialUrl: step.materialUrl, materialFileId: step.materialFileId }
    case 'lesson': {
      const lesson = await lessonFor(actor, course.id, step.id)
      return { kind: 'lesson', reached: lesson.sections.filter(s => s.reached).length, sections: lesson.sections.length }
    }
    case 'quiz': {
      const state = accountId ? await quizState(accountId, course.id, step) : null
      return { kind: 'quiz', tries: step.maxAttempts, used: state?.used ?? 0, nextTryAt: state?.nextTryAt ?? null }
    }
    case 'certificate':
    case 'declaration': {
      const last = accountId
        ? await first<{ state: string, reason: string | null }>(`SELECT state, reject_reason AS reason FROM training_evidence WHERE step_id = ?1 AND account_id IN (${accountScopeSql('?2')}) ORDER BY created_at DESC LIMIT 1`, step.id, accountId)
        : null
      return {
        kind: step.kind,
        waiting: last?.state === 'submitted',
        lastReason: last?.state === 'rejected' ? last.reason : null,
        expiry: step.evidenceExpiry,
        file: step.evidenceFile,
        qualifications: step.qualifications ?? [],
        otherQualification: step.otherQualification ?? true,
        hasQuestions: !!step.formVersionId,
      }
    }
    case 'activity': {
      const source = step.sourceId ? await stepSource(step.sourceId) : null
      return { kind: 'activity', source: source ? await source.describe(step.sourceParams ?? {}) : null }
    }
  }
}

export interface LearnerCourse {
  course: Pick<Course, 'id' | 'slug' | 'title' | 'summary' | 'expires' | 'validFor' | 'selfSignUp'>
  ways: Way[]
  mine: MyCourse | null
  steps: MyStep[]
  sessions: (Session & { placesLeft: number })[]
  changes: { number: number, publishedAt: number | null, changeKind: string | null, changeNote: string | null }[]
}

/** M3: one live course by its address, with the person's progress and an action on each step. */
export async function learnerCourse(actor: Actor, slug: string): Promise<LearnerCourse> {
  const row = await first<{ id: string }>('SELECT id FROM training_courses WHERE slug = ? AND status != \'unpublished\'', slug)
  const course = row ? await getCourse(row.id) : null
  if (!course?.liveVersionId) refuse('training.course.not-found', 'There is no such course.', { status: 404 })
  const steps = await stepsOf(course.liveVersionId)
  const progress = actor.accountId ? await progressOn(course, actor.accountId) : null
  const out: MyStep[] = []
  for (const step of steps) {
    const p = progress?.steps.find(s => s.stepId === step.id)
    out.push({ id: step.id, position: step.position, title: step.title, kind: step.kind, guidance: step.guidance, needed: step.timesRequired, done: p?.done ?? 0, met: p?.met ?? false, action: await actionFor(actor, course, step) })
  }
  const sessions = (await listSessions({ courseId: course.id, from: nowMs(), unpublished: false })).map(s => ({ ...s, placesLeft: Math.max(0, s.capacity - s.placesTaken) }))
  const changes = await all<LearnerCourse['changes'][number]>(
    'SELECT number, published_at AS publishedAt, change_kind AS changeKind, change_note AS changeNote FROM training_course_versions WHERE course_id = ? AND status != \'in-preparation\' ORDER BY number DESC',
    course.id,
  )
  return {
    course: { id: course.id, slug: course.slug, title: course.title, summary: course.summary, expires: course.expires, validFor: course.validFor, selfSignUp: course.selfSignUp },
    ways: waysToLearn(steps.map(s => s.kind)),
    mine: actor.accountId ? await mine(course, actor.accountId, await recordsOf(actor.accountId)) : null,
    steps: out,
    sessions,
    changes,
  }
}

export interface NextSession { id: string, startsAt: number, placesLeft: number }

/** The soonest published session of a course still taking sign-ups, for a renewal nudge (M1). */
async function nextSessionOf(courseId: string): Promise<NextSession | null> {
  const closes = (await useSetting('training.sessions.sign-up-closes-before') as number) * SECOND
  return first<NextSession>(
    'SELECT id, starts_at AS startsAt, max(0, capacity - places_taken) AS placesLeft FROM training_sessions WHERE course_id = ? AND status = \'published\' AND sign_up = \'open\' AND starts_at > ? ORDER BY starts_at LIMIT 1',
    courseId, nowMs() + closes,
  )
}

export interface MyTraining {
  /** Held or recently held, newest first: one per course, the latest that is not superseded. */
  records: (RecordView & { slug: string, myStatus: MyStatus, nextSession: NextSession | null })[]
  places: Awaited<ReturnType<typeof placesOfPerson>>
  inProgress: { courseId: string, slug: string, title: string, done: number, of: number }[]
  notApproved: { evidenceId: string, courseId: string, slug: string, title: string, reason: string | null }[]
  warnBefore: number
}

/** M1 and M5: what the person holds, what they are part-way through, their places and any evidence turned down. */
export async function myTraining(accountId: string): Promise<MyTraining> {
  const records = await recordsOf(accountId)
  const latest = new Map<string, RecordView>()
  for (const r of records) if (r.standing !== 'superseded' && !latest.has(r.courseId)) latest.set(r.courseId, r)
  const slugs = new Map((await all<{ id: string, slug: string }>('SELECT id, slug FROM training_courses')).map(c => [c.id, c.slug]))
  const started = await all<{ courseId: string }>(
    `SELECT DISTINCT s.course_id AS courseId FROM training_sign_offs s JOIN training_courses c ON c.id = s.course_id
      WHERE s.account_id IN (${accountScopeSql('?1')}) AND s.kind != 'void' AND c.status = 'live'`,
    accountId,
  )
  const inProgress: MyTraining['inProgress'] = []
  for (const { courseId } of started) {
    const held = latest.get(courseId)
    if (held && (held.standing === 'current' || held.standing === 'expiring') && !held.cutReason) continue
    const course = await getCourse(courseId)
    if (!course?.liveVersionId) continue
    const progress = await progressOn(course, accountId)
    const done = progress.steps.filter(s => s.met).length
    if (done && !progress.complete) inProgress.push({ courseId, slug: course.slug, title: course.title, done, of: progress.steps.length })
  }
  const notApproved = await all<MyTraining['notApproved'][number]>(
    `SELECT e.id AS evidenceId, e.course_id AS courseId, c.slug, c.title, e.reject_reason AS reason FROM training_evidence e JOIN training_courses c ON c.id = e.course_id
      WHERE e.account_id IN (${accountScopeSql('?1')}) AND e.state = 'rejected'
        AND NOT EXISTS (SELECT 1 FROM training_evidence n WHERE n.step_id = e.step_id AND n.account_id = e.account_id AND n.created_at > e.created_at)
      ORDER BY e.decided_at DESC`,
    accountId,
  )
  const held: MyTraining['records'] = []
  for (const r of latest.values()) {
    const myStatus = statusOf(r, 0)
    const renew = myStatus === 'expiring' || myStatus === 'lapsed' || myStatus === 'ends-early'
    held.push({ ...r, slug: slugs.get(r.courseId) ?? '', myStatus, nextSession: renew ? await nextSessionOf(r.courseId) : null })
  }
  return {
    records: held,
    places: await placesOfPerson(accountId),
    inProgress,
    notApproved,
    warnBefore: await useSetting('training.records.warn-before') as number * SECOND,
  }
}

export interface SessionTimes {
  /** When the person can no longer sign up here. */
  signUpClosesAt: number
  /** When the person can no longer cancel a booked place here; the start for a place that came up from the waiting list. */
  cancelUntil: number
  waitingList: boolean
  /** Their place in the waiting list, from 1, while they are waiting. */
  position: number | null
  /** The next published session of the course after this one, offered when this one is full. */
  next: { id: string, startsAt: number } | null
}

/** M4: the times that decide which action a person has on a session, and their place in line. */
export async function sessionTimes(session: Session, accountId: string | undefined): Promise<SessionTimes> {
  const place = accountId ? await placeFor(session.id, accountId) : null
  const promoted = place?.state === 'booked' && place.waitingSince !== null
  const position = place?.state === 'waiting'
    ? (await first<{ n: number }>('SELECT count(*) AS n FROM training_session_places WHERE session_id = ? AND state = \'waiting\' AND waiting_since <= ?', session.id, place.waitingSince))?.n ?? null
    : null
  const next = await first<{ id: string, startsAt: number }>(
    'SELECT id, starts_at AS startsAt FROM training_sessions WHERE course_id = ? AND status = \'published\' AND starts_at > ? ORDER BY starts_at LIMIT 1',
    session.courseId, session.startsAt,
  )
  return {
    signUpClosesAt: session.startsAt - (await useSetting('training.sessions.sign-up-closes-before') as number) * SECOND,
    cancelUntil: session.startsAt - (promoted ? 0 : (await useSetting('training.sessions.cancel-until') as number) * SECOND),
    waitingList: await useSetting('training.sessions.waiting-list') as boolean,
    position,
    next,
  }
}
