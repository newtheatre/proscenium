// Courses, their versions and steps, and who may teach them (part 3, V1 to V8; TR-01 to TR-04).
// A live or replaced version is never edited: every change is made to the one version in
// preparation, and publishing it replaces the live one in the same write.
import { all, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount } from '#modules/core'
import { slotQuiz } from '#modules/forms'
import type { ChangeKind, CourseState, NeededFor, StepKind, VersionState } from '../shared/states'
import type { CourseChange, CourseInput, StepInput } from './inputs'
import { endOfLocalDay, theatreDay } from './days'
import { sourceParams } from './sources'

export interface Course {
  id: string
  title: string
  slug: string
  summary: string | null
  categoryTermId: string | null
  expires: boolean
  validFor: number | null
  selfSignUp: boolean
  status: CourseState
  liveVersionId: string | null
  createdAt: number
  updatedAt: number
}

export interface Version {
  id: string
  courseId: string
  number: number
  status: VersionState
  changeKind: ChangeKind | null
  changeNote: string | null
  cutTo: number | null
  publishedAt: number | null
}

export interface Step {
  id: string
  versionId: string
  position: number
  title: string
  kind: StepKind
  neededFor: NeededFor
  timesRequired: number
  guidance: string | null
  materialUrl: string | null
  materialFileId: string | null
  evidenceExpiry: 'required' | 'optional' | 'none' | null
  evidenceFile: 'required' | 'optional' | 'forbidden' | null
  formId: string | null
  formVersionId: string | null
  maxAttempts: number | null
  retryAfter: number | null
  showAnswers: 'never' | 'after-pass' | 'after-each' | null
  sourceId: string | null
  sourceParams: Record<string, unknown> | null
  carriesStepId: string | null
}

const COURSE = `SELECT id, title, slug, summary, category_term_id AS categoryTermId, expires, valid_for AS validFor, self_sign_up AS selfSignUp,
  status, live_version_id AS liveVersionId, created_at AS createdAt, updated_at AS updatedAt FROM training_courses`
const VERSION = `SELECT id, course_id AS courseId, number, status, change_kind AS changeKind, change_note AS changeNote, cut_to AS cutTo,
  published_at AS publishedAt FROM training_course_versions`
const STEP = `SELECT id, version_id AS versionId, position, title, kind, needed_for AS neededFor, times_required AS timesRequired, guidance,
  material_url AS materialUrl, material_file_id AS materialFileId, evidence_expiry AS evidenceExpiry, evidence_file AS evidenceFile,
  form_id AS formId, form_version_id AS formVersionId, max_attempts AS maxAttempts, retry_after AS retryAfter, show_answers AS showAnswers,
  source_id AS sourceId, source_params AS sourceParams, carries_step_id AS carriesStepId FROM training_course_steps`

const SECTION_COLUMNS = ['id', 'step_id', 'position', 'kind', 'title', 'body', 'video_url', 'video_id', 'video_caption_note', 'scenario_id', 'carries_section_id', 'created_at', 'updated_at']

const course = (row: any): Course => ({ ...row, expires: !!row.expires, selfSignUp: !!row.selfSignUp })

export async function getCourse(id: string): Promise<Course | null> {
  const row = await first(`${COURSE} WHERE id = ?`, id)
  return row ? course(row) : null
}

export async function courseOrRefuse(id: string): Promise<Course> {
  return await getCourse(id) ?? refuse('training.course.not-found', 'There is no such course.', { status: 404 })
}

/** Courses by title. Unpublished ones only for those who manage courses. */
export async function listCourses(options: { unpublished: boolean }): Promise<Course[]> {
  const rows = await all(`${COURSE} ${options.unpublished ? '' : 'WHERE status = \'live\''} ORDER BY status = 'retired', lower(title)`)
  return rows.map(course)
}

export async function versionsOf(courseId: string): Promise<Version[]> {
  return all<Version>(`${VERSION} WHERE course_id = ? ORDER BY number DESC`, courseId)
}

const stepRow = <S extends Step>(row: any): S => ({ ...row, sourceParams: typeof row.sourceParams === 'string' ? JSON.parse(row.sourceParams) : row.sourceParams ?? null })

export async function stepsOf(versionId: string): Promise<Step[]> {
  return (await all(`${STEP} WHERE version_id = ? ORDER BY position`, versionId)).map(r => stepRow(r))
}

export async function getStep(id: string): Promise<(Step & { courseId: string, versionStatus: VersionState }) | null> {
  const row = await first(`SELECT s.*, v.course_id AS courseId, v.status AS versionStatus FROM (${STEP}) s JOIN training_course_versions v ON v.id = s.versionId WHERE s.id = ?`, id)
  return row ? stepRow<Step & { courseId: string, versionStatus: VersionState }>(row) : null
}

/** The version in preparation, if there is one. */
export async function preparing(courseId: string): Promise<Version | null> {
  return first<Version>(`${VERSION} WHERE course_id = ? AND status = 'in-preparation'`, courseId)
}

function slugOf(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course' // not-policy: a slug's shape
}

async function freeSlug(title: string, except?: string): Promise<string> {
  const base = slugOf(title)
  const taken = new Set((await all<{ slug: string }>('SELECT slug FROM training_courses WHERE (slug = ?1 OR slug LIKE ?1 || \'-%\') AND id IS NOT ?2', base, except ?? null)).map(r => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

/** A course's validity: its own, else the default, refused when the warning would come before it starts. */
async function validityOf(expires: boolean, validFor: number | null | undefined): Promise<number | null> {
  if (!expires) return null
  const value = validFor ?? await useSetting('training.records.default-valid-for') as number
  const warn = await useSetting('training.records.warn-before') as number
  if (value <= warn) refuse('training.course.valid-for-short', 'A course must stay valid for longer than the warning before it lapses.', { status: 422, fields: { validFor: 'Make it longer than the expiry warning in Training\'s settings.' } })
  return value
}

/** A new course, unpublished, with version 1 in preparation and no steps yet. */
export async function createCourse(unit: UnitView, actor: Actor, input: CourseInput): Promise<{ courseId: string, versionId: string }> {
  const courseId = newId('tcrs')
  const versionId = newId('tver')
  const at = nowMs()
  const validFor = await validityOf(input.expires, input.validFor)
  unit.add({
    sql: `INSERT INTO training_courses (id, title, slug, summary, category_term_id, expires, valid_for, self_sign_up, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpublished', ?, ?, ?)`,
    params: [courseId, input.title, await freeSlug(input.title), input.summary ?? null, input.categoryTermId ?? null, input.expires ? 1 : 0, validFor, input.selfSignUp === false ? 0 : 1, actor.accountId ?? null, at, at],
  })
  unit.add({ sql: 'INSERT INTO training_course_versions (id, course_id, number, status, created_at) VALUES (?, ?, 1, \'in-preparation\', ?)', params: [versionId, courseId, at] })
  unit.audit({ action: 'create', record: ['training.course', courseId] })
  return { courseId, versionId }
}

/** Changes what describes a course. Its steps change only through a version in preparation. */
export async function updateCourse(unit: UnitView, id: string, change: CourseChange): Promise<void> {
  const before = await courseOrRefuse(id)
  const expires = change.expires ?? before.expires
  const validFor = await validityOf(expires, change.validFor === undefined ? before.validFor : change.validFor)
  const title = change.title ?? before.title
  unit.add({
    sql: 'UPDATE training_courses SET title = ?, slug = ?, summary = ?, category_term_id = ?, expires = ?, valid_for = ?, self_sign_up = ?, updated_at = ? WHERE id = ?',
    params: [
      title, title === before.title ? before.slug : await freeSlug(title, id), change.summary === undefined ? before.summary : change.summary,
      change.categoryTermId === undefined ? before.categoryTermId : change.categoryTermId, expires ? 1 : 0, validFor,
      (change.selfSignUp ?? before.selfSignUp) ? 1 : 0, nowMs(), id,
    ],
  }).expect(1)
  unit.audit({ action: 'update', record: ['training.course', id], detail: { fields: Object.keys(change) } })
}

/**
 * Replaces the steps of the version in preparation (V1, V3). A step given with the id of one already
 * there keeps what it carries from unless its kind or times required changed or the author says it
 * changed; a new step carries from nothing.
 */
export async function saveSteps(unit: UnitView, courseId: string, input: StepInput[]): Promise<string[]> {
  const version = await preparing(courseId)
  if (!version) refuse('training.version-published', 'This version is published, so it cannot be changed.', { status: 409, remedy: 'Start a new version to change the steps.' })
  const before = new Map((await stepsOf(version.id)).map(s => [s.id, s]))
  const defaultAttempts = await useSetting('training.quizzes.default-max-attempts') as number | null
  const defaultRetry = await useSetting('training.quizzes.retry-after') as number
  // An activity step names a source that is on, with parameters the source accepts (H1).
  const sources = new Map<number, Record<string, unknown>>()
  for (const [i, x] of input.entries()) if (x.kind === 'activity') sources.set(i, await sourceParams(x.sourceId, x.sourceParams))
  const ids: string[] = []
  const rows = input.map((step, i) => {
    const old = step.id ? before.get(step.id) : undefined
    if (step.id && !old) refuse('training.step.not-found', 'A step was changed by someone else while you were editing.', { status: 409, remedy: 'Reload the course and try again.' })
    const timesRequired = step.kind === 'practical' || step.kind === 'activity' ? step.timesRequired : 1
    const keepsCarry = old && !step.changed && old.kind === step.kind && old.timesRequired === timesRequired
    const id = old?.id ?? newId('tstp')
    ids.push(id)
    return {
      id, position: i + 1, title: step.title, kind: step.kind, neededFor: step.neededFor, timesRequired,
      guidance: step.guidance ?? null,
      materialUrl: 'materialUrl' in step ? step.materialUrl ?? null : null,
      materialFileId: 'materialFileId' in step ? step.materialFileId ?? null : null,
      evidenceExpiry: step.kind === 'certificate' ? step.evidenceExpiry : null,
      evidenceFile: step.kind === 'certificate' ? step.evidenceFile : null,
      formId: step.kind === 'quiz' ? step.formId : null,
      maxAttempts: step.kind === 'quiz' ? (step.maxAttempts === undefined ? defaultAttempts : step.maxAttempts) : null,
      retryAfter: step.kind === 'quiz' ? step.retryAfter ?? defaultRetry : null,
      showAnswers: step.kind === 'quiz' ? step.showAnswers : null,
      sourceId: step.kind === 'activity' ? step.sourceId : null,
      sourceParams: step.kind === 'activity' ? JSON.stringify(sources.get(i)) : null,
      carriesStepId: keepsCarry ? old.carriesStepId : null,
    }
  })
  // A lesson's sections go out with its step and come back if the step is kept as a lesson (O5).
  const kept = new Set(rows.filter(r => r.kind === 'lesson').map(r => r.id))
  const sections = (await all<{ step_id: string }>('SELECT * FROM training_lesson_sections WHERE step_id IN (SELECT id FROM training_course_steps WHERE version_id = ?)', version.id))
    .filter(x => kept.has(x.step_id))
  unit.add({ sql: 'DELETE FROM training_lesson_sections WHERE step_id IN (SELECT id FROM training_course_steps WHERE version_id = ?)', params: [version.id] })
  // One statement clears and one writes the set, whatever the number of steps (T4).
  unit.add({ sql: 'DELETE FROM training_course_steps WHERE version_id = ?', params: [version.id] })
  unit.add({
    sql: `INSERT INTO training_course_steps (id, version_id, position, title, kind, needed_for, times_required, guidance, material_url, material_file_id, evidence_expiry, evidence_file,
        form_id, max_attempts, retry_after, show_answers, source_id, source_params, carries_step_id)
      SELECT j.value ->> 'id', ?, j.value ->> 'position', j.value ->> 'title', j.value ->> 'kind', j.value ->> 'neededFor', j.value ->> 'timesRequired', j.value ->> 'guidance',
        j.value ->> 'materialUrl', j.value ->> 'materialFileId', j.value ->> 'evidenceExpiry', j.value ->> 'evidenceFile',
        j.value ->> 'formId', j.value ->> 'maxAttempts', j.value ->> 'retryAfter', j.value ->> 'showAnswers', j.value ->> 'sourceId', j.value ->> 'sourceParams', j.value ->> 'carriesStepId'
      FROM json_each(?) j`,
    params: [version.id, JSON.stringify(rows)],
  }).expect(rows.length)
  if (sections.length) unit.add({ sql: `INSERT INTO training_lesson_sections (${SECTION_COLUMNS.join(', ')}) SELECT ${SECTION_COLUMNS.map(c => `j.value ->> '${c}'`).join(', ')} FROM json_each(?) j`, params: [JSON.stringify(sections)] }).expect(sections.length)
  unit.audit({ action: 'update', record: ['training.course', courseId], detail: { version: version.number, steps: rows.length } })
  return ids
}

/** Starts the next version by copying the live one's steps, each carrying from the step it copies (V1). */
export async function startVersion(unit: UnitView, courseId: string): Promise<string> {
  const course = await courseOrRefuse(courseId)
  if (await preparing(courseId)) refuse('training.version.preparing', 'A new version of this course is already being prepared.', { status: 409, remedy: 'Carry on with that version.' })
  if (!course.liveVersionId) refuse('training.version.preparing', 'This course has not been published yet.', { status: 409 })
  const latest = (await versionsOf(courseId))[0]!
  const versionId = newId('tver')
  unit.add({ sql: 'INSERT INTO training_course_versions (id, course_id, number, status, created_at) VALUES (?, ?, ?, \'in-preparation\', ?)', params: [versionId, courseId, latest.number + 1, nowMs()] })
  const steps = (await stepsOf(course.liveVersionId)).map(s => ({ ...s, newId: newId('tstp') }))
  unit.add({
    sql: `INSERT INTO training_course_steps (id, version_id, position, title, kind, needed_for, times_required, guidance, material_url, material_file_id, evidence_expiry, evidence_file,
        form_id, max_attempts, retry_after, show_answers, source_id, source_params, carries_step_id)
      SELECT j.value ->> 'newId', ?, s.position, s.title, s.kind, s.needed_for, s.times_required, s.guidance, s.material_url, s.material_file_id, s.evidence_expiry, s.evidence_file,
        s.form_id, s.max_attempts, s.retry_after, s.show_answers, s.source_id, s.source_params, s.id
      FROM json_each(?) j JOIN training_course_steps s ON s.id = j.value ->> 'id'`,
    params: [versionId, JSON.stringify(steps.map(s => ({ id: s.id, newId: s.newId })))],
  })
  // Each lesson section is copied too, carrying from the one it copies (O5).
  const sections = await all<{ id: string, stepId: string }>('SELECT id, step_id AS stepId FROM training_lesson_sections WHERE step_id IN (SELECT id FROM training_course_steps WHERE version_id = ?)', course.liveVersionId)
  if (sections.length) {
    const stepOf = new Map(steps.map(s => [s.id, s.newId]))
    unit.add({
      sql: `INSERT INTO training_lesson_sections (id, step_id, position, kind, title, body, video_url, video_id, video_caption_note, scenario_id, carries_section_id, created_at, updated_at)
        SELECT j.value ->> 'newId', j.value ->> 'stepId', x.position, x.kind, x.title, x.body, x.video_url, x.video_id, x.video_caption_note, x.scenario_id, x.id, ?2, ?2
        FROM json_each(?1) j JOIN training_lesson_sections x ON x.id = j.value ->> 'id'`,
      params: [JSON.stringify(sections.map(x => ({ id: x.id, newId: newId('tlsc'), stepId: stepOf.get(x.stepId) }))), nowMs()],
    }).expect(sections.length)
  }
  unit.audit({ action: 'update', record: ['training.course', courseId], detail: { versionStarted: latest.number + 1 } })
  return versionId
}

/**
 * Publishes the version in preparation (V4 to V7). Version 1 makes the course live. A later version
 * asks whether training records stand; retraining required cuts every current record short to the
 * end of the day the grace ends, in one statement, keeping the old date.
 */
export async function publish(unit: UnitView, actor: Actor, courseId: string, input: { changeKind?: ChangeKind, changeNote?: string | null }): Promise<{ versionId: string, number: number, cutTo: number | null }> {
  const course = await courseOrRefuse(courseId)
  const version = await preparing(courseId)
  if (!version) refuse('training.version-published', 'There is no new version to publish.', { status: 409 })
  if (course.status === 'retired') refuse('training.course.retired', 'This course is retired.', { status: 409, remedy: 'Bring the course back first.' })
  const steps = await stepsOf(version.id)
  if (!steps.length) refuse('training.version.no-steps', 'A course needs at least one step before it is published.', { status: 422 })
  const pins = await pinQuizzes(courseId, steps)
  const first = version.number === 1
  if (!first && !input.changeKind) refuse('training.version.change-kind', 'Say whether people who hold the course must retrain.', { status: 422, fields: { changeKind: 'Choose one.' } })
  const changeKind: ChangeKind = first ? 'records-stand' : input.changeKind!
  const at = nowMs()
  let cutTo: number | null = null
  if (changeKind === 'retraining-required') {
    const grace = await useSetting('training.versions.retrain-grace') as number
    cutTo = await endOfLocalDay(await theatreDay(at + grace * 1000)) // not-policy: settings are whole seconds
  }

  unit.add({ sql: 'UPDATE training_course_versions SET status = \'replaced\' WHERE course_id = ? AND status = \'live\'', params: [courseId] }).expect(first ? 0 : 1)
  unit.add({
    sql: 'UPDATE training_course_versions SET status = \'live\', change_kind = ?, change_note = ?, cut_to = ?, published_by = ?, published_at = ? WHERE id = ? AND status = \'in-preparation\'',
    params: [changeKind, input.changeNote ?? null, cutTo, actor.accountId ?? null, at, version.id],
  }).expect(1, { code: 'training.version-published', reason: 'Someone else published this version a moment ago.' })
  unit.add({ sql: 'UPDATE training_courses SET live_version_id = ?, status = CASE status WHEN \'unpublished\' THEN \'live\' ELSE status END, updated_at = ? WHERE id = ?', params: [version.id, at, courseId] }).expect(1)
  if (pins.length) {
    unit.add({
      sql: 'UPDATE training_course_steps SET form_version_id = j.value ->> \'versionId\' FROM json_each(?) j WHERE training_course_steps.id = j.value ->> \'stepId\'',
      params: [JSON.stringify(pins)],
    }).expect(pins.length)
  }
  // Sessions not yet started move to the new version; one already started keeps its own (V7).
  unit.add({ sql: 'UPDATE training_sessions SET version_id = ?, updated_at = ? WHERE course_id = ? AND starts_at > ? AND status IN (\'unpublished\', \'published\')', params: [version.id, at, courseId, at] })
  if (cutTo !== null) {
    // Every holder at once (V6). Telling each one is the job of the notifications slice.
    unit.add({
      sql: `UPDATE training_records SET natural_expires_at = coalesce(natural_expires_at, expires_at), expires_at = ?1, cut_reason = 'material-changed', updated_at = ?2
        WHERE course_id = ?3 AND status = 'awarded' AND (expires_at IS NULL OR expires_at > ?1)`, // not-policy: bound parameters
      params: [cutTo, at, courseId],
    })
  }
  unit.announce('training.course.published', { courseId, versionId: version.id, number: version.number, changeKind }, { record: ['training.course', courseId] })
  unit.audit({ action: 'state', record: ['training.course', courseId], detail: { published: version.number, changeKind } })
  return { versionId: version.id, number: version.number, cutTo }
}

/**
 * Each quiz step's form, pinned at its live version, which must have correct answers and a pass mark
 * and be attached to the course in the slot training.quiz (Q1).
 */
async function pinQuizzes(courseId: string, steps: Step[]): Promise<{ stepId: string, versionId: string }[]> {
  const out: { stepId: string, versionId: string }[] = []
  for (const step of steps.filter(s => s.kind === 'quiz')) {
    const quiz = await slotQuiz('training.quiz', courseId, step.formId!)
    if (!quiz?.marked)
      refuse('training.quiz.not-marked', `The quiz for "${step.title}" needs a published form, attached to this course, with correct answers and a pass mark.`, { status: 422, remedy: 'Set the answers and pass mark in the form, publish it, and attach it to the course.' })
    out.push({ stepId: step.id, versionId: quiz.versionId })
  }
  return out
}

/** Retires a course: no new sessions, sign-offs or evidence; its records run to their dates (V8). */
export async function retire(unit: UnitView, courseId: string): Promise<void> {
  unit.add({ sql: 'UPDATE training_courses SET status = \'retired\', updated_at = ? WHERE id = ? AND status = \'live\'', params: [nowMs(), courseId] })
    .expect(1, { code: 'training.course.not-live', reason: 'Only a live course can be retired.' })
  unit.announce('training.course.retired', { courseId }, { record: ['training.course', courseId] })
  unit.audit({ action: 'state', record: ['training.course', courseId], detail: { status: 'retired' } })
}

export async function revive(unit: UnitView, courseId: string): Promise<void> {
  unit.add({ sql: 'UPDATE training_courses SET status = \'live\', updated_at = ? WHERE id = ? AND status = \'retired\'', params: [nowMs(), courseId] })
    .expect(1, { code: 'training.course.not-retired', reason: 'This course is not retired.' })
  unit.audit({ action: 'state', record: ['training.course', courseId], detail: { status: 'live' } })
}

// Trainers (TR-04). A row means the person may teach the course; the fact training.course-trainer
// reads it, so naming one needs course.manage at the course and no grant from Identity.

export interface Trainer { accountId: string, addedAt: number }

/** The course's trainers, each person once however many of their merged accounts are listed. */
export async function trainersOf(courseId: string): Promise<Trainer[]> {
  return all<Trainer>(
    `SELECT coalesce(a.merged_into_id, t.account_id) AS accountId, min(t.added_at) AS addedAt FROM training_course_trainers t
      LEFT JOIN core_accounts a ON a.id = t.account_id WHERE t.course_id = ? GROUP BY 1 ORDER BY 2`,
    courseId,
  )
}

export async function isTrainer(courseId: string, accountId: string): Promise<boolean> {
  return !!await first(`SELECT 1 FROM training_course_trainers WHERE course_id = ?1 AND account_id IN (${accountScopeSql('?2')})`, courseId, accountId)
}

export async function addTrainer(unit: UnitView, actor: Actor, courseId: string, accountId: string): Promise<void> {
  await courseOrRefuse(courseId)
  const person = await canonicalAccount(accountId)
  if (await isTrainer(courseId, person)) return
  unit.add({ sql: 'INSERT INTO training_course_trainers (course_id, account_id, added_by, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', params: [courseId, person, actor.accountId ?? null, nowMs()] })
  unit.audit({ action: 'update', record: ['training.course', courseId], detail: { trainerAdded: person } })
}

export async function removeTrainer(unit: UnitView, courseId: string, accountId: string): Promise<void> {
  if (!await isTrainer(courseId, accountId)) refuse('training.trainer.not-found', 'That person is not a trainer of this course.', { status: 404 })
  unit.add({ sql: `DELETE FROM training_course_trainers WHERE course_id = ?1 AND account_id IN (${accountScopeSql('?2')})`, params: [courseId, accountId] })
  unit.audit({ action: 'update', record: ['training.course', courseId], detail: { trainerRemoved: accountId } })
}
