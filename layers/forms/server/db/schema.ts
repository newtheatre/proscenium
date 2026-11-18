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
/** The slot a standalone link occupies. Slots other modules declare come with slice 6. */
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

export const tables = { forms, drafts, versions, fields, placements, responses, responseDrafts, answers }
