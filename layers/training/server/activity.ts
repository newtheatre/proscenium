// Activity steps (amended part 3, H1 to H4; TR-49). Training reads a step source's confirmed
// occurrences for one person, when the source announces one, when the person opens the course and
// in the daily sweep, and writes one `activity` sign-off per occurrence, once per course. Reading
// twice writes nothing new: the sign-offs already written are skipped, and the unique index on
// (course, account, source, occurrence) settles two reads at once.
import { all, nowMs, useSetting, type UnitView } from '#kit'
import { accountScopeIds, accountScopeSql } from '#kit/accounts'
import { canonicalAccount } from '#modules/core'
import { getCourse } from './courses'
import { addDays, theatreDay } from './days'
import { addSignOff, evaluateAward, neededSteps, samePerson, type PendingSignOff } from './progress'
import { stepSources } from './sources'

const DAY = 86_400 // not-policy: seconds in a day
const REF_MAX = 64 // not-policy: the schema's limit on source_ref (part 2)

interface ActivityStep { id: string, courseId: string, sourceId: string, sourceParams: string | null }

/** Activity steps on the live version of live courses, for one course or some sources if given. */
async function liveActivitySteps(filter: { courseId?: string, sourceIds?: string[] }): Promise<ActivityStep[]> {
  return all<ActivityStep>(
    `SELECT s.id, v.course_id AS courseId, s.source_id AS sourceId, s.source_params AS sourceParams FROM training_course_steps s
       JOIN training_course_versions v ON v.id = s.version_id JOIN training_courses c ON c.live_version_id = v.id
      WHERE s.kind = 'activity' AND c.status = 'live' AND (?1 IS NULL OR c.id = ?1)
        AND (?2 IS NULL OR s.source_id IN (SELECT value FROM json_each(?2))) ORDER BY c.id, s.position`, // not-policy: bound parameters
    filter.courseId ?? null, filter.sourceIds ? JSON.stringify(filter.sourceIds) : null,
  )
}

export interface ActivityRead { signOffIds: string[], recordIds: string[] }

/**
 * Reads the step sources for one person and signs off what they report (H2, H3). Only confirmed
 * occurrences inside the progress window and since the last award count, never one the person
 * confirmed themself; a source that is switched off reports nothing (H4).
 */
export async function readActivity(unit: UnitView, accountId: string, filter: { courseId?: string, sourceIds?: string[] } = {}): Promise<ActivityRead> {
  const out: ActivityRead = { signOffIds: [], recordIds: [] }
  const steps = await liveActivitySteps(filter)
  if (!steps.length) return out
  const sources = new Map((await stepSources()).map(x => [x.id, x.source]))
  const person = await canonicalAccount(accountId)
  const scope = await accountScopeIds(person)
  const today = await theatreDay(nowMs())
  const windowFrom = addDays(today, -Math.ceil((await useSetting('training.progress.complete-within') as number) / DAY))
  const byCourse = new Map<string, ActivityStep[]>()
  for (const s of steps) byCourse.set(s.courseId, [...byCourse.get(s.courseId) ?? [], s])
  for (const [courseId, list] of byCourse) {
    const course = await getCourse(courseId)
    if (!course) continue
    const { steps: needed, since } = await neededSteps(course, person)
    const wanted = new Set(needed.map(s => s.id))
    const lastAward = since === null ? null : await theatreDay(since)
    const from = lastAward && lastAward > windowFrom ? lastAward : windowFrom
    const done = new Set((await all<{ key: string }>(
      `SELECT source_id || ' ' || source_ref AS key FROM training_sign_offs WHERE course_id = ?1 AND kind = 'activity' AND account_id IN (${accountScopeSql('?2')})`,
      courseId, person,
    )).map(r => r.key))
    const pending: PendingSignOff[] = []
    for (const step of list) {
      const source = sources.get(step.sourceId)
      if (!source || !wanted.has(step.id)) continue
      const params = step.sourceParams ? JSON.parse(step.sourceParams) as Record<string, unknown> : {}
      for (const o of await source.occurrences(scope, params, from)) {
        if (!scope.includes(o.accountId) || o.on < from || o.on > today || !o.occurrenceId || o.occurrenceId.length > REF_MAX) continue
        if (!o.confirmedBy || await samePerson(o.confirmedBy, person)) continue
        const key = `${step.sourceId} ${o.occurrenceId}`
        if (done.has(key)) continue
        done.add(key)
        pending.push(addSignOff(unit, { accountId: person, courseId, stepId: step.id, kind: 'activity', signedBy: null, occurredOn: o.on, source: { id: step.sourceId, ref: o.occurrenceId, confirmedBy: o.confirmedBy } }))
      }
    }
    if (!pending.length) continue
    out.signOffIds.push(...pending.map(p => p.id))
    const recordId = await evaluateAward(unit, course, person, pending)
    if (recordId) out.recordIds.push(recordId)
  }
  return out
}

/** A source announced a confirmed occurrence: reads that source's steps for the person (H2). */
export async function activityAnnounced(unit: UnitView, eventName: string, accountId: string): Promise<ActivityRead> {
  const sourceIds = (await stepSources()).filter(x => x.source.event === eventName).map(x => x.id)
  if (!sourceIds.length) return { signOffIds: [], recordIds: [] }
  return readActivity(unit, accountId, { sourceIds })
}

/** Each person with a sign-off inside the progress window on a live course with an activity step, and the course (H2). */
export async function peopleToSweep(): Promise<{ accountId: string, courseId: string }[]> {
  const today = await theatreDay(nowMs())
  const from = addDays(today, -Math.ceil((await useSetting('training.progress.complete-within') as number) / DAY))
  return all<{ accountId: string, courseId: string }>(
    `SELECT DISTINCT o.account_id AS accountId, o.course_id AS courseId FROM training_sign_offs o JOIN training_courses c ON c.id = o.course_id
      WHERE o.kind != 'void' AND o.occurred_on >= ?1 AND c.status = 'live'
        AND EXISTS (SELECT 1 FROM training_course_steps s WHERE s.version_id = c.live_version_id AND s.kind = 'activity')`,
    from,
  )
}
