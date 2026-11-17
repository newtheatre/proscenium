// Forms' tables (form builder specification, part 2), as far as the build has reached: a form, its
// draft, its published versions and its field catalogue. Two departures from the specification's
// layout, both to keep its own promises with the kit as it is:
// - The draft is its own row (forms_drafts), so forms_versions holds published versions only and is
//   append-only: the kit's triggers then refuse any change to a published version. "Superseded" is
//   not stored; a version is superseded when it is no longer the form's live one.
// - A question is identified by its form and its id in the definition, not by a site-wide id, so a
//   form exported as JSON can be imported any number of times.
import { check, index, integer, primaryKey, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
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

export const tables = { forms, drafts, versions, fields }
