// Training: seventeen tables (docs/specs/training-records part 2, amended by docs/specs/training
// part 2). What is taught, the competencies it adds up to, sessions, and what a person has done.
// Whether a person is trained is read from sign-offs and dates when asked; nothing stores it.
import { integer, text, check, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import {
  ATTEMPT_KINDS, CANCEL_KINDS, CHANGE_KINDS, COMPETENCY_STATES, COURSE_STATES, EVIDENCE_EXPIRY, EVIDENCE_FILE, EVIDENCE_KINDS, EVIDENCE_STATES,
  NEEDED_FOR, PLACE_STATES, RECORD_ORIGINS, RECORD_STATES, REVOKE_CODES, ROUTE_ITEM_KINDS, ROUTE_STATES, SECTION_KINDS, SESSION_STATES,
  SHOW_ANSWERS, SIGN_OFF_KINDS, SIGN_UP, STEP_KINDS, VERSION_STATES, VIDEO_STATES,
} from '../../shared/states'

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))
const DAY = sql.raw('\'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]\'')

// What is taught

export const courses = defineTable('training_courses', {
  id: col.id(),
  title: col.internal(text('title').notNull()),
  slug: col.internal(text('slug').notNull()),
  summary: col.internal(text('summary')),
  categoryTermId: col.ref('core_terms', { nullable: true }),
  expires: col.internal(integer('expires', { mode: 'boolean' }).notNull()),
  // Seconds; defaults from training.records.default-valid-for.
  validFor: col.internal(integer('valid_for')),
  selfSignUp: col.internal(integer('self_sign_up', { mode: 'boolean' }).notNull().default(true)),
  status: col.internal(text('status', { enum: COURSE_STATES }).notNull().default('unpublished')),
  liveVersionId: col.ref('training_course_versions', { nullable: true }),
  createdBy: col.account('created_by', { role: 'actor' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tcrs',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_courses_slug').on(t.slug),
    index('training_courses_status').on(t.status, t.title),
    check('training_courses_status_values', sql`${t.status} IN (${inList(COURSE_STATES)})`),
    check('training_courses_title', sql`length(${t.title}) BETWEEN 1 AND 120`),
    check('training_courses_summary', sql`${t.summary} IS NULL OR length(${t.summary}) <= 500`),
    check('training_courses_valid_for', sql`(${t.expires} = 1 AND ${t.validFor} > 0) OR (${t.expires} = 0 AND ${t.validFor} IS NULL)`),
    check('training_courses_live', sql`(${t.status} = 'unpublished') = (${t.liveVersionId} IS NULL)`),
  ],
})

export const versions = defineTable('training_course_versions', {
  id: col.id(),
  courseId: col.ref('training_courses'),
  number: col.internal(integer('number').notNull()),
  status: col.internal(text('status', { enum: VERSION_STATES }).notNull().default('in-preparation')),
  changeKind: col.internal(text('change_kind', { enum: CHANGE_KINDS })),
  changeNote: col.internal(text('change_note')),
  cutTo: col.timestamp('cut_to'),
  publishedBy: col.account('published_by', { role: 'actor', nullable: true }),
  publishedAt: col.timestamp('published_at'),
  createdAt: col.createdAt(),
}, {
  id: 'tver',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_course_versions_number').on(t.courseId, t.number),
    // At most one version of a course in preparation (V1).
    uniqueIndex('training_course_versions_preparing').on(t.courseId).where(sql`status = 'in-preparation'`),
    check('training_course_versions_number_from_one', sql`${t.number} >= 1`),
    check('training_course_versions_status', sql`${t.status} IN (${inList(VERSION_STATES)})`),
    check('training_course_versions_change', sql`(${t.status} = 'in-preparation') = (${t.changeKind} IS NULL) AND (${t.changeKind} IS NULL OR ${t.changeKind} IN (${inList(CHANGE_KINDS)}))`),
    check('training_course_versions_first', sql`${t.number} > 1 OR ${t.changeKind} IS NULL OR ${t.changeKind} = 'records-stand'`),
    check('training_course_versions_note', sql`${t.changeNote} IS NULL OR length(${t.changeNote}) <= 500`),
  ],
})

export const steps = defineTable('training_course_steps', {
  id: col.id(),
  versionId: col.ref('training_course_versions'),
  position: col.internal(integer('position').notNull()),
  title: col.internal(text('title').notNull()),
  kind: col.internal(text('kind', { enum: STEP_KINDS }).notNull()),
  neededFor: col.internal(text('needed_for', { enum: NEEDED_FOR }).notNull().default('both')),
  timesRequired: col.internal(integer('times_required').notNull().default(1)),
  guidance: col.internal(text('guidance')),
  materialUrl: col.internal(text('material_url')),
  materialFileId: col.ref('core_files', { nullable: true }),
  evidenceExpiry: col.internal(text('evidence_expiry', { enum: EVIDENCE_EXPIRY })),
  evidenceFile: col.internal(text('evidence_file', { enum: EVIDENCE_FILE })),
  formId: col.ref('forms_forms', { nullable: true }),
  formVersionId: col.ref('forms_versions', { nullable: true }),
  maxAttempts: col.internal(integer('max_attempts')),
  retryAfter: col.internal(integer('retry_after')),
  showAnswers: col.internal(text('show_answers', { enum: SHOW_ANSWERS })),
  sourceId: col.internal(text('source_id')),
  sourceParams: col.internal(text('source_params', { mode: 'json' }).$type<Record<string, unknown>>()),
  qualifications: col.internal(text('qualifications', { mode: 'json' }).$type<{ title: string, issuers: string[] }[]>()),
  otherQualification: col.internal(integer('other_qualification', { mode: 'boolean' })),
  carriesStepId: col.ref('training_course_steps', { nullable: true }),
}, {
  id: 'tstp',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_course_steps_position').on(t.versionId, t.position),
    index('training_course_steps_carries').on(t.carriesStepId),
    check('training_course_steps_position_range', sql`${t.position} BETWEEN 1 AND 20`),
    check('training_course_steps_kind', sql`${t.kind} IN (${inList(STEP_KINDS)})`),
    check('training_course_steps_needed_for', sql`${t.neededFor} IN (${inList(NEEDED_FOR)})`),
    check('training_course_steps_title', sql`length(${t.title}) BETWEEN 1 AND 120`),
    check('training_course_steps_times', sql`${t.timesRequired} BETWEEN 1 AND 20 AND (${t.timesRequired} = 1 OR ${t.kind} IN ('practical', 'activity'))`),
    check('training_course_steps_guidance', sql`${t.guidance} IS NULL OR length(${t.guidance}) <= 2000`),
    check('training_course_steps_evidence', sql`(${t.kind} = 'certificate') = (${t.evidenceExpiry} IS NOT NULL) AND (${t.kind} IN ('certificate', 'declaration')) = (${t.evidenceFile} IS NOT NULL)`),
    check('training_course_steps_form', sql`(${t.kind} = 'quiz' AND ${t.formId} IS NOT NULL) OR ${t.kind} = 'declaration' OR (${t.formId} IS NULL AND ${t.formVersionId} IS NULL)`),
    check('training_course_steps_quiz', sql`${t.kind} = 'quiz' OR (${t.maxAttempts} IS NULL AND ${t.retryAfter} IS NULL AND ${t.showAnswers} IS NULL)`),
    check('training_course_steps_attempts', sql`${t.maxAttempts} IS NULL OR ${t.maxAttempts} BETWEEN 1 AND 20`),
    check('training_course_steps_source', sql`(${t.kind} = 'activity') = (${t.sourceId} IS NOT NULL) AND (${t.kind} = 'activity' OR ${t.sourceParams} IS NULL)`),
    check('training_course_steps_qualifications', sql`${t.kind} = 'certificate' OR (${t.qualifications} IS NULL AND ${t.otherQualification} IS NULL)`),
    check('training_course_steps_lesson', sql`${t.kind} != 'lesson' OR (${t.guidance} IS NULL AND ${t.materialUrl} IS NULL AND ${t.materialFileId} IS NULL)`),
  ],
})

export const videos = defineTable('training_videos', {
  id: col.id(),
  courseId: col.ref('training_courses'),
  streamUid: col.internal(text('stream_uid').notNull()),
  status: col.internal(text('status', { enum: VIDEO_STATES }).notNull().default('uploading')),
  failedReason: col.internal(text('failed_reason')),
  durationSeconds: col.internal(integer('duration_seconds')),
  uploadedBy: col.account('uploaded_by', { role: 'actor' }),
  uploadedAt: col.timestamp('uploaded_at').notNull(),
  readyAt: col.timestamp('ready_at'),
  deletedAt: col.timestamp('deleted_at'),
}, {
  id: 'tvid',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_videos_stream').on(t.streamUid),
    index('training_videos_course').on(t.courseId, t.status),
    check('training_videos_status', sql`${t.status} IN (${inList(VIDEO_STATES)})`),
    check('training_videos_reason', sql`${t.failedReason} IS NULL OR length(${t.failedReason}) <= 200`),
  ],
})

export const sections = defineTable('training_lesson_sections', {
  id: col.id(),
  stepId: col.ref('training_course_steps'),
  position: col.internal(integer('position').notNull()),
  kind: col.internal(text('kind', { enum: SECTION_KINDS }).notNull()),
  title: col.internal(text('title').notNull()),
  // Markdown, shown through core's one sanitising renderer.
  body: col.internal(text('body')),
  videoUrl: col.internal(text('video_url')),
  videoId: col.ref('training_videos', { nullable: true }),
  videoCaptionNote: col.internal(text('video_caption_note')),
  scenarioId: col.internal(text('scenario_id')),
  carriesSectionId: col.ref('training_lesson_sections', { nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tlsc',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_lesson_sections_position').on(t.stepId, t.position),
    check('training_lesson_sections_position_range', sql`${t.position} BETWEEN 1 AND 30`),
    check('training_lesson_sections_kind', sql`${t.kind} IN (${inList(SECTION_KINDS)})`),
    check('training_lesson_sections_title', sql`length(${t.title}) BETWEEN 1 AND 120`),
    check('training_lesson_sections_body', sql`${t.body} IS NULL OR length(${t.body}) <= 20000`),
    check('training_lesson_sections_one_video', sql`${t.videoUrl} IS NULL OR ${t.videoId} IS NULL`),
    check('training_lesson_sections_caption', sql`${t.videoCaptionNote} IS NULL OR length(${t.videoCaptionNote}) <= 200`),
    check('training_lesson_sections_scenario', sql`(${t.kind} = 'practice') = (${t.scenarioId} IS NOT NULL)`),
  ],
})

export const competencies = defineTable('training_competencies', {
  id: col.id(),
  title: col.internal(text('title').notNull()),
  slug: col.internal(text('slug').notNull()),
  description: col.internal(text('description')),
  status: col.internal(text('status', { enum: COMPETENCY_STATES }).notNull().default('retired')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tcmp',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_competencies_slug').on(t.slug),
    check('training_competencies_status', sql`${t.status} IN (${inList(COMPETENCY_STATES)})`),
    check('training_competencies_title', sql`length(${t.title}) BETWEEN 1 AND 80`),
    check('training_competencies_description', sql`${t.description} IS NULL OR length(${t.description}) <= 500`),
  ],
})

export const routes = defineTable('training_competency_routes', {
  id: col.id(),
  competencyId: col.ref('training_competencies'),
  position: col.internal(integer('position').notNull()),
  label: col.internal(text('label').notNull()),
  status: col.internal(text('status', { enum: ROUTE_STATES }).notNull().default('active')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'trte',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('training_competency_routes_position').on(t.competencyId, t.position),
    check('training_competency_routes_position_from_one', sql`${t.position} >= 1`),
    check('training_competency_routes_status', sql`${t.status} IN (${inList(ROUTE_STATES)})`),
    check('training_competency_routes_label', sql`length(${t.label}) BETWEEN 1 AND 80`),
  ],
})

export const routeItems = defineTable('training_route_items', {
  routeId: col.ref('training_competency_routes'),
  position: col.internal(integer('position').notNull()),
  kind: col.internal(text('kind', { enum: ROUTE_ITEM_KINDS }).notNull()),
  courseId: col.ref('training_courses', { nullable: true }),
  // Another source's core.requirement reference, never interpreted here (R2, R6).
  requirementRef: col.internal(text('requirement_ref')),
  createdAt: col.createdAt(),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.routeId, t.position] }),
    index('training_route_items_course').on(t.courseId),
    check('training_route_items_position_from_one', sql`${t.position} >= 1`),
    check('training_route_items_one_kind', sql`(${t.kind} = 'course' AND ${t.courseId} IS NOT NULL AND ${t.requirementRef} IS NULL) OR (${t.kind} = 'recognised' AND ${t.courseId} IS NULL AND ${t.requirementRef} IS NOT NULL)`),
    // No chain of checks leads back to Training (R7).
    check('training_route_items_not_training', sql`${t.requirementRef} IS NULL OR (${t.requirementRef} NOT LIKE 'training:%' AND ${t.requirementRef} NOT LIKE 'fact:training.%' AND length(${t.requirementRef}) <= 200)`),
  ],
})

export const courseTrainers = defineTable('training_course_trainers', {
  courseId: col.ref('training_courses'),
  accountId: col.account('account_id', { role: 'subject' }),
  addedBy: col.account('added_by', { role: 'actor', nullable: true }),
  addedAt: col.timestamp('added_at').notNull(),
}, {
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.courseId, t.accountId] }),
    index('training_course_trainers_account').on(t.accountId),
  ],
})

// Sessions

export const sessions = defineTable('training_sessions', {
  id: col.id(),
  courseId: col.ref('training_courses'),
  versionId: col.ref('training_course_versions'),
  title: col.internal(text('title')),
  startsAt: col.timestamp('starts_at').notNull(),
  endsAt: col.timestamp('ends_at').notNull(),
  spaceId: col.ref('core_spaces', { nullable: true }),
  placeNote: col.internal(text('place_note')),
  capacity: col.internal(integer('capacity').notNull()),
  // Kept by the triggers on places; never written by code.
  placesTaken: col.internal(integer('places_taken').notNull().default(0)),
  signUp: col.internal(text('sign_up', { enum: SIGN_UP }).notNull().default('open')),
  status: col.internal(text('status', { enum: SESSION_STATES }).notNull().default('unpublished')),
  cancelReason: col.internal(text('cancel_reason')),
  attendanceClosedAt: col.timestamp('attendance_closed_at'),
  createdBy: col.account('created_by', { role: 'actor' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tses',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('training_sessions_course').on(t.courseId, t.startsAt),
    index('training_sessions_space').on(t.spaceId, t.startsAt),
    index('training_sessions_status').on(t.status, t.startsAt),
    check('training_sessions_times', sql`${t.endsAt} > ${t.startsAt}`),
    check('training_sessions_capacity', sql`${t.capacity} >= 1`),
    // The last place is taken once: the trigger's sum fails the unit past capacity (P2).
    check('training_sessions_full', sql`${t.placesTaken} BETWEEN 0 AND ${t.capacity}`),
    check('training_sessions_sign_up', sql`${t.signUp} IN (${inList(SIGN_UP)})`),
    check('training_sessions_status_values', sql`${t.status} IN (${inList(SESSION_STATES)})`),
    check('training_sessions_title', sql`${t.title} IS NULL OR length(${t.title}) BETWEEN 1 AND 120`),
    check('training_sessions_note', sql`${t.placeNote} IS NULL OR length(${t.placeNote}) <= 200`),
    check('training_sessions_reason', sql`${t.cancelReason} IS NULL OR length(${t.cancelReason}) <= 300`),
  ],
})

export const sessionTrainers = defineTable('training_session_trainers', {
  sessionId: col.ref('training_sessions'),
  accountId: col.account('account_id', { role: 'subject' }),
  createdAt: col.createdAt(),
}, {
  realm: 'members',
  retention: 'training.retention.attendance',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.sessionId, t.accountId] }),
    index('training_session_trainers_account').on(t.accountId),
  ],
})

export const places = defineTable('training_session_places', {
  id: col.id(),
  sessionId: col.ref('training_sessions'),
  // A place is once only for a person and a session, so the merge handler keeps the stronger.
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  state: col.internal(text('state', { enum: PLACE_STATES }).notNull()),
  counted: col.internal(integer('counted').notNull()),
  waitingSince: col.timestamp('waiting_since'),
  addedBy: col.account('added_by', { role: 'actor' }),
  cancelledAt: col.timestamp('cancelled_at'),
  cancelKind: col.internal(text('cancel_kind', { enum: CANCEL_KINDS })),
  markedBy: col.account('marked_by', { role: 'actor', nullable: true }),
  markedAt: col.timestamp('marked_at'),
  note: col.freeText(text('note')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tplc',
  realm: 'members',
  retention: 'training.retention.attendance',
  extra: t => [
    uniqueIndex('training_session_places_once').on(t.sessionId, t.accountId).where(sql`state != 'cancelled'`),
    index('training_session_places_account').on(t.accountId),
    index('training_session_places_waiting').on(t.sessionId, t.state, t.waitingSince),
    check('training_session_places_state', sql`${t.state} IN (${inList(PLACE_STATES)})`),
    check('training_session_places_counted', sql`${t.counted} = (CASE WHEN ${t.state} IN ('booked', 'attended', 'absent') THEN 1 ELSE 0 END)`),
    check('training_session_places_waiting_since', sql`(${t.state} = 'waiting') <= (${t.waitingSince} IS NOT NULL)`),
    check('training_session_places_cancel', sql`(${t.state} = 'cancelled') = (${t.cancelKind} IS NOT NULL) AND (${t.cancelKind} IS NULL OR ${t.cancelKind} IN (${inList(CANCEL_KINDS)}))`),
    check('training_session_places_note', sql`${t.note} IS NULL OR length(${t.note}) <= 300`),
  ],
})

// What a person has done

export const evidence = defineTable('training_evidence', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  courseId: col.ref('training_courses'),
  stepId: col.ref('training_course_steps'),
  kind: col.internal(text('kind', { enum: EVIDENCE_KINDS }).notNull()),
  issuer: col.personal(text('issuer'), { erase: 'clear' }),
  reference: col.personal(text('reference'), { erase: 'clear' }),
  issuedOn: col.personal(text('issued_on'), { erase: 'clear' }),
  expiresOn: col.personal(text('expires_on'), { erase: 'clear' }),
  qualification: col.personal(text('qualification'), { erase: 'clear' }),
  statement: col.personal(text('statement'), { erase: 'clear' }),
  organisation: col.personal(text('organisation'), { erase: 'clear' }),
  doneFrom: col.personal(text('done_from'), { erase: 'clear' }),
  doneTo: col.personal(text('done_to'), { erase: 'clear' }),
  linkUrl: col.personal(text('link_url'), { erase: 'clear' }),
  referee: col.personal(text('referee'), { erase: 'clear' }),
  responseId: col.ref('forms_responses', { nullable: true }),
  fileId: col.ref('core_files', { nullable: true }),
  seenOnly: col.internal(integer('seen_only', { mode: 'boolean' }).notNull().default(false)),
  state: col.internal(text('state', { enum: EVIDENCE_STATES }).notNull().default('submitted')),
  submittedBy: col.account('submitted_by', { role: 'actor' }),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  rejectReason: col.freeText(text('reject_reason')),
  retentionDueAt: col.timestamp('retention_due_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tevd',
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [
    index('training_evidence_account').on(t.accountId, t.courseId),
    index('training_evidence_queue').on(t.state, t.createdAt),
    check('training_evidence_kind', sql`${t.kind} IN (${inList(EVIDENCE_KINDS)})`),
    check('training_evidence_state', sql`${t.state} IN (${inList(EVIDENCE_STATES)})`),
    check('training_evidence_certificate', sql`${t.kind} != 'certificate' OR (${t.issuer} IS NOT NULL AND ${t.issuedOn} IS NOT NULL)`),
    check('training_evidence_declaration', sql`${t.kind} != 'declaration' OR ${t.statement} IS NOT NULL`),
    check('training_evidence_lengths', sql`(${t.issuer} IS NULL OR length(${t.issuer}) <= 120) AND (${t.reference} IS NULL OR length(${t.reference}) <= 80) AND (${t.qualification} IS NULL OR length(${t.qualification}) <= 120)
      AND (${t.statement} IS NULL OR length(${t.statement}) <= 2000) AND (${t.organisation} IS NULL OR length(${t.organisation}) <= 120) AND (${t.linkUrl} IS NULL OR length(${t.linkUrl}) <= 500)
      AND (${t.referee} IS NULL OR length(${t.referee}) <= 200) AND (${t.rejectReason} IS NULL OR length(${t.rejectReason}) <= 300)`),
    check('training_evidence_days', sql`(${t.issuedOn} IS NULL OR ${t.issuedOn} GLOB ${DAY}) AND (${t.expiresOn} IS NULL OR (${t.expiresOn} GLOB ${DAY} AND (${t.issuedOn} IS NULL OR ${t.expiresOn} > ${t.issuedOn})))
      AND (${t.doneFrom} IS NULL OR ${t.doneFrom} GLOB ${DAY}) AND (${t.doneTo} IS NULL OR (${t.doneTo} GLOB ${DAY} AND (${t.doneFrom} IS NULL OR ${t.doneTo} >= ${t.doneFrom})))`),
    check('training_evidence_seen_only', sql`${t.seenOnly} = 0 OR ${t.fileId} IS NULL`),
  ],
})

export const lessonProgress = defineTable('training_lesson_progress', {
  accountId: col.account('account_id', { role: 'subject' }),
  sectionId: col.ref('training_lesson_sections'),
  stepId: col.ref('training_course_steps'),
  reachedAt: col.timestamp('reached_at').notNull(),
}, {
  realm: 'members',
  retention: 'training.retention.attendance',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.accountId, t.sectionId] }),
    index('training_lesson_progress_step').on(t.accountId, t.stepId),
  ],
})

export const attempts = defineTable('training_quiz_attempts', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  courseId: col.ref('training_courses'),
  stepId: col.ref('training_course_steps'),
  kind: col.internal(text('kind', { enum: ATTEMPT_KINDS }).notNull()),
  responseId: col.ref('forms_responses', { nullable: true }),
  formVersionId: col.ref('forms_versions', { nullable: true }),
  score: col.internal(integer('score')),
  outOf: col.internal(integer('out_of')),
  passed: col.internal(integer('passed', { mode: 'boolean' })),
  allowedBy: col.account('allowed_by', { role: 'actor', nullable: true }),
  note: col.freeText(text('note')),
  createdAt: col.createdAt(),
}, {
  id: 'tqat',
  realm: 'members',
  retention: 'training.retention.attendance',
  extra: t => [
    uniqueIndex('training_quiz_attempts_response').on(t.responseId).where(sql`response_id IS NOT NULL`),
    index('training_quiz_attempts_step').on(t.accountId, t.stepId, t.createdAt),
    check('training_quiz_attempts_kind', sql`${t.kind} IN (${inList(ATTEMPT_KINDS)})`),
    check('training_quiz_attempts_attempt', sql`${t.kind} != 'attempt' OR (${t.responseId} IS NOT NULL AND ${t.formVersionId} IS NOT NULL AND ${t.score} IS NOT NULL AND ${t.outOf} IS NOT NULL AND ${t.passed} IS NOT NULL AND ${t.score} BETWEEN 0 AND ${t.outOf})`),
    check('training_quiz_attempts_allowance', sql`${t.kind} != 'allowance' OR (${t.allowedBy} IS NOT NULL AND ${t.responseId} IS NULL)`),
    check('training_quiz_attempts_note', sql`${t.note} IS NULL OR length(${t.note}) <= 300`),
  ],
})

export const signOffs = defineTable('training_sign_offs', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  courseId: col.ref('training_courses'),
  stepId: col.ref('training_course_steps'),
  kind: col.internal(text('kind', { enum: SIGN_OFF_KINDS }).notNull()),
  signedBy: col.account('signed_by', { role: 'actor', nullable: true }),
  // The day the thing was done, in the theatre's time zone.
  occurredOn: col.localDate('occurred_on').notNull(),
  placeId: col.ref('training_session_places', { nullable: true }),
  evidenceId: col.ref('training_evidence', { nullable: true }),
  attemptId: col.ref('training_quiz_attempts', { nullable: true }),
  sourceId: col.internal(text('source_id')),
  sourceRef: col.internal(text('source_ref')),
  confirmedBy: col.account('confirmed_by', { role: 'actor', nullable: true }),
  voidsId: col.ref('training_sign_offs', { nullable: true }),
  note: col.freeText(text('note')),
  createdAt: col.createdAt(),
}, {
  id: 'tsof',
  realm: 'members',
  appendOnly: true,
  extra: t => [
    index('training_sign_offs_progress').on(t.accountId, t.courseId, t.stepId),
    uniqueIndex('training_sign_offs_voids').on(t.voidsId).where(sql`voids_id IS NOT NULL`),
    // Each occurrence of an activity counts once towards a course (H3).
    uniqueIndex('training_sign_offs_activity_once').on(t.courseId, t.accountId, t.sourceId, t.sourceRef).where(sql`kind = 'activity'`),
    check('training_sign_offs_kind', sql`${t.kind} IN (${inList(SIGN_OFF_KINDS)})`),
    check('training_sign_offs_day', sql`${t.occurredOn} GLOB ${DAY}`),
    check('training_sign_offs_void', sql`(${t.kind} = 'void') = (${t.voidsId} IS NOT NULL) AND (${t.kind} != 'void' OR ${t.note} IS NOT NULL)`),
    check('training_sign_offs_attendance', sql`(${t.kind} = 'attendance') = (${t.placeId} IS NOT NULL)`),
    check('training_sign_offs_evidence', sql`(${t.kind} = 'evidence') = (${t.evidenceId} IS NOT NULL)`),
    check('training_sign_offs_quiz', sql`(${t.kind} = 'quiz') = (${t.attemptId} IS NOT NULL)`),
    check('training_sign_offs_activity', sql`(${t.kind} = 'activity') = (${t.sourceId} IS NOT NULL AND ${t.sourceRef} IS NOT NULL) AND (${t.sourceRef} IS NULL OR length(${t.sourceRef}) <= 64)`),
    check('training_sign_offs_note', sql`${t.note} IS NULL OR length(${t.note}) <= 500`),
  ],
})

export const records = defineTable('training_records', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject' }),
  courseId: col.ref('training_courses'),
  versionId: col.ref('training_course_versions'),
  origin: col.internal(text('origin', { enum: RECORD_ORIGINS }).notNull()),
  signOffIds: col.internal(text('sign_off_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)),
  awardedAt: col.timestamp('awarded_at').notNull(),
  awardedBy: col.account('awarded_by', { role: 'actor', nullable: true }),
  directReason: col.freeText(text('direct_reason')),
  // The one date every reader uses; null never lapses. Lapsed is read from it, never stored.
  expiresAt: col.timestamp('expires_at'),
  naturalExpiresAt: col.timestamp('natural_expires_at'),
  cutReason: col.internal(text('cut_reason', { enum: ['material-changed'] })),
  status: col.internal(text('status', { enum: RECORD_STATES }).notNull().default('awarded')),
  endedAt: col.timestamp('ended_at'),
  supersededBy: col.ref('training_records', { nullable: true }),
  revokedBy: col.account('revoked_by', { role: 'actor', nullable: true }),
  revokeCode: col.internal(text('revoke_code', { enum: REVOKE_CODES })),
  revokeNote: col.freeText(text('revoke_note')),
  warnedAt: col.timestamp('warned_at'),
  lapseAnnouncedAt: col.timestamp('lapse_announced_at'),
  retentionDueAt: col.timestamp('retention_due_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'trec',
  realm: 'members',
  extra: t => [
    // One live training record per person and course, as written; merged accounts read through the scope (C7).
    uniqueIndex('training_records_awarded').on(t.accountId, t.courseId).where(sql`status = 'awarded'`),
    index('training_records_course').on(t.courseId, t.status, t.expiresAt),
    index('training_records_expiry').on(t.status, t.expiresAt),
    check('training_records_origin', sql`${t.origin} IN (${inList(RECORD_ORIGINS)})`),
    check('training_records_status', sql`${t.status} IN (${inList(RECORD_STATES)})`),
    check('training_records_direct', sql`${t.origin} != 'direct' OR (${t.directReason} IS NOT NULL AND ${t.awardedBy} IS NOT NULL)`),
    check('training_records_ended', sql`(${t.status} = 'awarded') = (${t.endedAt} IS NULL)`),
    check('training_records_superseded', sql`(${t.status} = 'superseded') = (${t.supersededBy} IS NOT NULL)`),
    check('training_records_revoked', sql`(${t.status} = 'revoked') = (${t.revokeCode} IS NOT NULL) AND (${t.revokeCode} IS NULL OR ${t.revokeCode} IN (${inList(REVOKE_CODES)}))`),
    check('training_records_cut', sql`(${t.cutReason} IS NULL) = (${t.naturalExpiresAt} IS NULL)`),
    check('training_records_lengths', sql`(${t.directReason} IS NULL OR length(${t.directReason}) <= 500) AND (${t.revokeNote} IS NULL OR length(${t.revokeNote}) <= 500)`),
  ],
})

export const tables = {
  courses, versions, steps, videos, sections, competencies, routes, routeItems, courseTrainers,
  sessions, sessionTrainers, places, evidence, lessonProgress, attempts, signOffs, records,
}
