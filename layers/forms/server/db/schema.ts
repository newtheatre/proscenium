// Forms' tables (form builder specification, part 2), as far as the build has reached: a form, its
// draft, its published versions and its field catalogue; then where it is offered, the responses to
// it, their unsent working copies and their answers. Two departures from the specification's
// layout, both to keep its own promises with the kit as it is:
// - The draft is its own row (forms_drafts), so forms_versions holds published versions only and is
//   append-only: the kit's triggers then refuse any change to a published version. "Superseded" is
//   not stored; a version is superseded when it is no longer the form's live one.
// - A question is identified by its form and its id in the definition, not by a site-wide id, so a
//   form exported as JSON can be imported any number of times.
import { check, index, integer, primaryKey, real, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'
import { DATA_CLASSES, QUESTION_TYPES } from '../../shared/engine/types'

export const FORM_MODES = ['submission', 'record'] as const
export const FORM_STATUSES = ['draft', 'live', 'paused', 'closed', 'archived'] as const
const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

export const forms = defineTable('forms_forms', {
  id: col.id(),
  slug: col.internal(text('slug').notNull()),
  title: col.internal(text('title').notNull()),
  mode: col.internal(text('mode', { enum: FORM_MODES }).notNull().default('submission')),
  status: col.internal(text('status', { enum: FORM_STATUSES }).notNull().default('draft')),
  // Null until the first publish.
  liveVersionId: col.ref('forms_versions', { nullable: true }),
  // Fixed after the first publish.
  anonymous: col.internal(integer('anonymous', { mode: 'boolean' }).notNull().default(false)),
  // How long answers are kept. A form's own field, not a setting (part 6).
  retentionDays: col.internal(integer('retention_days')),
  retentionDeclinedDays: col.internal(integer('retention_declined_days')),
  // Whether the person who sent a response may change it or withdraw it before it is considered.
  allowEdits: col.internal(integer('allow_edits', { mode: 'boolean' }).notNull().default(false)),
  templateKey: col.internal(text('template_key')),
  createdBy: col.account('created_by', { role: 'actor' }),
  createdAt: col.createdAt(),
  archivedAt: col.timestamp('archived_at'),
}, {
  id: 'frm',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('forms_forms_slug').on(t.slug),
    check('forms_forms_mode', sql`${t.mode} IN (${inList(FORM_MODES)})`),
    check('forms_forms_status', sql`${t.status} IN (${inList(FORM_STATUSES)})`),
  ],
})

/** The one draft a form has: edited freely, saved as the author goes, and seen by nobody else until Publish. */
export const drafts = defineTable('forms_drafts', {
  formId: col.ref('forms_forms'),
  definition: col.internal(text('definition').notNull()),
  format: col.internal(integer('format').notNull()),
  // Raised on every save. A save that states a stale one is refused ("Two editors").
  editRevision: col.internal(integer('edit_revision').notNull().default(0)),
  editedBy: col.account('edited_by', { role: 'actor' }),
  updatedAt: col.updatedAt(),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.formId] })],
})

/** A published version: one immutable definition. The database refuses any change to it. */
export const versions = defineTable('forms_versions', {
  id: col.id(),
  formId: col.ref('forms_forms'),
  number: col.internal(integer('number').notNull()),
  definition: col.internal(text('definition').notNull()),
  definitionHash: col.internal(text('definition_hash').notNull()),
  format: col.internal(integer('format').notNull()),
  // What changed from the version before, and its impact: safe, caution or breaking.
  changeSummary: col.internal(text('change_summary').notNull()),
  publishedBy: col.account('published_by', { role: 'actor' }),
  publishedAt: col.createdAt(),
}, {
  id: 'fver',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [uniqueIndex('forms_versions_number').on(t.formId, t.number)],
})

/** The field catalogue: one row per question identity, across every version of a form. Written at publish. */
export const fields = defineTable('forms_fields', {
  formId: col.ref('forms_forms'),
  questionId: col.internal(text('question_id').notNull()),
  key: col.internal(text('key').notNull()),
  // Fixed for the life of the question.
  type: col.internal(text('type', { enum: QUESTION_TYPES }).notNull()),
  // May be raised, never lowered.
  dataClass: col.internal(text('data_class', { enum: DATA_CLASSES }).notNull()),
  label: col.internal(text('label').notNull()),
  firstVersion: col.internal(integer('first_version').notNull()),
  retiredInVersion: col.internal(integer('retired_in_version')),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.formId, t.questionId] }),
    uniqueIndex('forms_fields_key').on(t.formId, t.key),
    index('forms_fields_form').on(t.formId),
    check('forms_fields_class', sql`${t.dataClass} IN (${inList(DATA_CLASSES)})`),
  ],
})

export const AUDIENCES = ['anyone', 'signed_in', 'members', 'role', 'invited'] as const
export const EDIT_AFTER = ['never', 'until_close', 'when_returned'] as const
export const PLACEMENT_STATUSES = ['active', 'paused', 'ended'] as const
export const RESPONSE_STATES = ['draft', 'awaiting_payment', 'submitted', 'withdrawn'] as const
export const STAGE_KINDS = ['pending', 'in_review', 'returned', 'approved', 'declined', 'closed'] as const
export const RESPONSE_REALMS = ['audience', 'members'] as const
/**
 * What staff wrote to the person with a move, kept so staff can see later why a response was sent
 * back. The history itself holds no words and is never changed; these are words, so they sit apart,
 * where erasure and retention can remove them. Only staff read them: the person sees the note of
 * the stage their response is in now, and nothing once they have sent their changes.
 */
export const stageNotes = defineTable('forms_stage_notes', {
  id: col.id(),
  responseId: col.ref('forms_responses'),
  // When the move was made: the same instant as its row in the history.
  at: col.timestamp('at').notNull(),
  note: col.freeText(text('note'), { erase: 'clear' }),
}, {
  id: 'fsn',
  realm: 'operational',
  subject: { via: 'response_id' },
  extra: t => [index('forms_stage_notes_response').on(t.responseId, t.at)],
})

export const ASSIGNMENT_STATUSES = ['assigned', 'submitted', 'conflicted'] as const
export const CONFLICTS = ['declared', 'automatic'] as const
export const VOTES = ['for', 'against', 'abstain'] as const
/** The slot a standalone link occupies. The others are declared by modules, through forms.slot. */
export const LINK_SLOT = 'forms.link'

/** Where a form is offered: a link of its own, or (later) a slot another module declares. */
export const placements = defineTable('forms_placements', {
  id: col.id(),
  formId: col.ref('forms_forms'),
  slotKey: col.internal(text('slot_key').notNull()),
  subjectType: col.internal(text('subject_type')),
  subjectId: col.internal(text('subject_id')),
  audience: col.internal(text('audience', { enum: AUDIENCES }).notNull().default('anyone')),
  audienceRole: col.internal(text('audience_role')),
  opensAt: col.timestamp('opens_at'),
  closesAt: col.timestamp('closes_at'),
  responseCap: col.internal(integer('response_cap')),
  // Raised by each submission in the submission's own batch; the check below is what holds the cap
  // when several arrive at once.
  responseCount: col.internal(integer('response_count').notNull().default(0)),
  onePerPerson: col.internal(integer('one_per_person', { mode: 'boolean' }).notNull().default(false)),
  editAfterSubmit: col.internal(text('edit_after_submit', { enum: EDIT_AFTER }).notNull().default('never')),
  status: col.internal(text('status', { enum: PLACEMENT_STATUSES }).notNull().default('active')),
  createdBy: col.account('created_by', { role: 'actor' }),
  createdAt: col.createdAt(),
}, {
  id: 'fpl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('forms_placements_place').on(t.slotKey, t.subjectType, t.subjectId, t.formId),
    index('forms_placements_form').on(t.formId),
    check('forms_placements_audience', sql`${t.audience} IN (${inList(AUDIENCES)})`),
    check('forms_placements_edit', sql`${t.editAfterSubmit} IN (${inList(EDIT_AFTER)})`),
    check('forms_placements_status', sql`${t.status} IN (${inList(PLACEMENT_STATUSES)})`),
    check('forms_placements_cap', sql`${t.responseCap} IS NULL OR ${t.responseCount} <= ${t.responseCap}`),
    check('forms_placements_count', sql`${t.responseCount} >= 0`),
  ],
})

/**
 * One response. Its id is made by the browser before the first save, so a submission sent twice can
 * never make a second response.
 */
export const responses = defineTable('forms_responses', {
  id: col.id(),
  // A short code a person can quote.
  reference: col.internal(text('reference').notNull()),
  formId: col.ref('forms_forms'),
  versionId: col.ref('forms_versions'),
  placementId: col.ref('forms_placements'),
  subjectType: col.internal(text('subject_type')),
  subjectId: col.internal(text('subject_id')),
  // The side it was answered on, fixed when it is made.
  realm: col.internal(text('realm', { enum: RESPONSE_REALMS }).notNull()),
  // Null for an anonymous form, and for a response made while signed out.
  personId: col.account('person_id', { role: 'subject', onMerge: 'move', reason: 'One response each is held by a unique key, which must name the surviving account.', nullable: true }),
  // The address a signed-out respondent gave. Where there is an account as well, the account wins.
  respondentEmail: col.email('respondent_email', { erase: 'clear' }),
  enteredBy: col.account('entered_by', { role: 'actor', nullable: true }),
  state: col.internal(text('state', { enum: RESPONSE_STATES }).notNull()),
  stageKey: col.internal(text('stage_key')),
  stageKind: col.internal(text('stage_kind', { enum: STAGE_KINDS })),
  currentRevision: col.internal(integer('current_revision').notNull().default(0)),
  // What staff wrote to the person with the latest move, such as what to change; gone when they send again.
  stageNote: col.freeText(text('stage_note'), { erase: 'clear' }),
  /** Why the last decision was made, for the record. Never shown to the person who sent the response. */
  decisionReason: col.freeText(text('decision_reason'), { erase: 'clear' }),
  // The account id, or a keyed hash of the address, where the placement allows one response each.
  uniqueKey: col.personal(text('unique_key'), { erase: 'clear' }),
  // What the form's calculations came to when it was sent.
  calculated: col.personal(text('calculated'), { erase: 'clear' }),
  isTest: col.internal(integer('is_test', { mode: 'boolean' }).notNull().default(false)),
  submittedAt: col.timestamp('submitted_at'),
  decidedAt: col.timestamp('decided_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
  retentionDueAt: col.timestamp('retention_due_at'),
  anonymisedAt: col.timestamp('anonymised_at'),
  // When the person was last reminded that it waits on them: an unfinished working copy left
  // untouched, or a response returned for changes. A returned response counts as reminded only
  // when this is later than the move that returned it, so each return earns one reminder.
  remindedWaitingAt: col.timestamp('reminded_waiting_at'),
  // When the person was reminded that the form closes soon. Once only.
  remindedClosingAt: col.timestamp('reminded_closing_at'),
}, {
  id: 'fres',
  realm: { column: 'realm' },
  subject: { account: 'person_id', unlinked: 'staff' },
  extra: t => [
    uniqueIndex('forms_responses_reference').on(t.reference),
    uniqueIndex('forms_responses_unique').on(t.placementId, t.uniqueKey),
    index('forms_responses_form').on(t.formId, t.state, t.submittedAt),
    index('forms_responses_person').on(t.personId),
    index('forms_responses_retention').on(t.retentionDueAt),
    index('forms_responses_waiting').on(t.state, t.stageKind),
    check('forms_responses_state', sql`${t.state} IN (${inList(RESPONSE_STATES)})`),
    check('forms_responses_stage', sql`${t.stageKind} IS NULL OR ${t.stageKind} IN (${inList(STAGE_KINDS)})`),
    check('forms_responses_realm', sql`${t.realm} IN (${inList(RESPONSE_REALMS)})`),
  ],
})

/**
 * The working copy of a response not yet sent. Sealed whole: it can hold any class of answer and is
 * never searched. Deleted when the response is sent.
 */
export const responseDrafts = defineTable('forms_response_drafts', {
  responseId: col.ref('forms_responses'),
  answersCipher: col.special('answers_cipher'),
  pageId: col.internal(text('page_id')),
  updatedAt: col.updatedAt(),
}, {
  realm: 'audience',
  subject: { via: 'response_id' },
  // An unsent working copy is nothing without its person: it goes altogether.
  onErasure: 'delete-row',
  extra: t => [primaryKey({ columns: [t.responseId] })],
})

/**
 * One row per question per revision of a sent response. Append-only: a correction is a new
 * revision. Each row carries the class its question had when it was written, and a special-category
 * answer is held only sealed.
 */
export const answers = defineTable('forms_answers', {
  responseId: col.ref('forms_responses'),
  revision: col.internal(integer('revision').notNull()),
  questionId: col.internal(text('question_id').notNull()),
  // The entry within a repeating group; 0 outside one.
  repeatIndex: col.internal(integer('repeat_index').notNull().default(0)),
  dataClass: col.internal(text('data_class', { enum: DATA_CLASSES }).notNull()),
  valueText: col.perRow(text('value_text'), { classColumn: 'data_class' }),
  valueNumber: col.perRow(real('value_number'), { classColumn: 'data_class' }),
  // Several choices, an address, file references.
  valueJson: col.perRow(text('value_json'), { classColumn: 'data_class' }),
  // What was written beside "Other".
  otherText: col.perRow(text('other_text'), { classColumn: 'data_class' }),
  // Used instead of the columns above for a special-category answer.
  valueCipher: col.special('value_cipher'),
  // The words of the chosen options or record at the time.
  labelSnapshot: col.perRow(text('label_snapshot'), { classColumn: 'data_class' }),
}, {
  realm: 'audience',
  subject: { via: 'response_id' },
  appendOnly: true,
  extra: t => [
    primaryKey({ columns: [t.responseId, t.revision, t.questionId, t.repeatIndex] }),
    index('forms_answers_text').on(t.questionId, t.valueText),
    index('forms_answers_number').on(t.questionId, t.valueNumber),
    check('forms_answers_class', sql`${t.dataClass} IN (${inList(DATA_CLASSES)})`),
  ],
})

/**
 * Every move of a response between stages (FB-403), the first being its arrival. Append-only. It
 * holds no words of anybody's: what staff write to the person with a move is on the response.
 */
export const stageHistory = defineTable('forms_stage_history', {
  id: col.id(),
  responseId: col.ref('forms_responses'),
  // Null on arrival.
  fromStage: col.internal(text('from_stage')),
  toStage: col.internal(text('to_stage').notNull()),
  toKind: col.internal(text('to_kind', { enum: STAGE_KINDS }).notNull()),
  transitionKey: col.internal(text('transition_key').notNull()),
  // The revision of the answers as the move was made.
  revision: col.internal(integer('revision').notNull()),
  // Null when the person who sent it was not signed in, or the system made the move.
  actorId: col.account('actor_id', { role: 'actor', nullable: true }),
  at: col.timestamp('at').notNull(),
}, {
  id: 'fstg',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('forms_stage_history_response').on(t.responseId, t.at),
    check('forms_stage_history_kind', sql`${t.toKind} IN (${inList(STAGE_KINDS)})`),
  ],
})

/**
 * One round of review: a response's stay in a stage that asks for review (FB-405). A response that
 * comes back to the stage starts a new round. Reviews are private until the round is released.
 */
export const reviewRounds = defineTable('forms_review_rounds', {
  id: col.id(),
  responseId: col.ref('forms_responses'),
  formId: col.ref('forms_forms'),
  stageKey: col.internal(text('stage_key').notNull()),
  revision: col.internal(integer('revision').notNull()),
  openedAt: col.timestamp('opened_at').notNull(),
  releasedAt: col.timestamp('released_at'),
  releasedBy: col.account('released_by', { role: 'actor', nullable: true }),
  closedAt: col.timestamp('closed_at'),
}, {
  id: 'frnd',
  realm: 'operational',
  subject: 'none',
  extra: t => [index('forms_review_rounds_response').on(t.responseId, t.openedAt)],
})

/**
 * One reviewer's place in a round, and their review: marks against the criteria or a vote, and a
 * comment. A reviewer with a conflict of interest keeps the row, marked, and holds no review (FB-406).
 */
export const reviewAssignments = defineTable('forms_review_assignments', {
  id: col.id(),
  roundId: col.ref('forms_review_rounds'),
  responseId: col.ref('forms_responses'),
  formId: col.ref('forms_forms'),
  reviewerId: col.account('reviewer_id', { role: 'actor' }),
  status: col.internal(text('status', { enum: ASSIGNMENT_STATUSES }).notNull().default('assigned')),
  conflict: col.internal(text('conflict', { enum: CONFLICTS })),
  vote: col.internal(text('vote', { enum: VOTES })),
  scores: col.personal(text('scores'), { erase: 'clear' }),
  comment: col.freeText(text('comment'), { erase: 'clear' }),
  submittedAt: col.timestamp('submitted_at'),
  createdAt: col.createdAt(),
  // When the reviewer was reminded that their review is still owed. Once a round.
  remindedAt: col.timestamp('reminded_at'),
}, {
  id: 'fasg',
  realm: 'operational',
  subject: { via: 'response_id' },
  extra: t => [
    uniqueIndex('forms_review_assignments_one').on(t.roundId, t.reviewerId),
    index('forms_review_assignments_reviewer').on(t.reviewerId, t.status),
    index('forms_review_assignments_response').on(t.responseId),
    check('forms_review_assignments_status', sql`${t.status} IN (${inList(ASSIGNMENT_STATUSES)})`),
    check('forms_review_assignments_conflict', sql`${t.conflict} IS NULL OR ${t.conflict} IN (${inList(CONFLICTS)})`),
    check('forms_review_assignments_vote', sql`${t.vote} IS NULL OR ${t.vote} IN (${inList(VOTES)})`),
  ],
})

export const RUN_STATES = ['waiting', 'done', 'skipped'] as const

/**
 * One outcome action asked of another module by one move of one response (FB-506). It waits until
 * its job has run it; the job marks it done in the same unit as the action's own writes.
 */
export const actionRuns = defineTable('forms_action_runs', {
  id: col.id(),
  responseId: col.ref('forms_responses'),
  formId: col.ref('forms_forms'),
  moveKey: col.internal(text('move_key').notNull()),
  // The action's place on the move, and the action itself, as the response's own version had them.
  useId: col.internal(text('use_id').notNull()),
  actionKey: col.internal(text('action_key').notNull()),
  // Which question fills each of the action's inputs: ids only.
  map: col.internal(text('map').notNull()),
  revision: col.internal(integer('revision').notNull()),
  actorId: col.account('actor_id', { role: 'actor', nullable: true }),
  state: col.internal(text('state', { enum: RUN_STATES }).notNull().default('waiting')),
  // Why it was skipped. Never anybody's words.
  detail: col.internal(text('detail')),
  // What the action made, where it says: shown through the type's record resolver.
  recordType: col.internal(text('record_type')),
  recordId: col.internal(text('record_id')),
  jobId: col.internal(text('job_id')),
  createdAt: col.createdAt(),
  finishedAt: col.timestamp('finished_at'),
}, {
  id: 'frun',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('forms_action_runs_response').on(t.responseId, t.createdAt),
    check('forms_action_runs_state', sql`${t.state} IN (${inList(RUN_STATES)})`),
  ],
})

/** A template the theatre saved from one of its own forms. Those the platform ships are files, not rows. */
export const templates = defineTable('forms_templates', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  definition: col.internal(text('definition').notNull()),
  createdBy: col.account('created_by', { role: 'actor' }),
  createdAt: col.createdAt(),
}, {
  id: 'ftpl',
  realm: 'operational',
  subject: 'none',
})

/**
 * An address a form used to be reached by. Somebody following an old link is sent on to the form's
 * address now, so changing an address never breaks a link already handed out.
 */
export const oldAddresses = defineTable('forms_old_addresses', {
  slug: col.internal(text('slug').notNull()),
  formId: col.ref('forms_forms'),
  createdAt: col.createdAt(),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.slug] }), index('forms_old_addresses_form').on(t.formId)],
})

export const tables = { oldAddresses, stageNotes, forms, drafts, versions, fields, placements, responses, responseDrafts, answers, stageHistory, reviewRounds, reviewAssignments, actionRuns, templates }
