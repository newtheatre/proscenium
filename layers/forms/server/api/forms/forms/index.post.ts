// Starts a form (FB-201, FB-208): blank, from a template, or from a file exported from this or
// another site. A form from a template is a copy that remembers only which one it was. An imported
// definition is checked against the format like any other, and keeps its own question ids, which
// only need to be unique within the form.
import { z } from 'zod'
import { defineRoute, newId, nowMs } from '#kit'
import { TITLE_LENGTH, blankDefinition, freeSlug, parseOrRefuse } from '../../../forms'
import { FORM_MODES } from '../../../db/schema'
import { startFrom } from '../../../templates'

const input = z.object({
  title: z.string().trim().min(1).max(TITLE_LENGTH),
  mode: z.enum(FORM_MODES).default('submission'),
  definition: z.unknown().optional(),
  template: z.string().max(64).optional(), // not-policy: shape bound
})

export default defineRoute({ ability: 'forms.form.create', rateLimit: 'write', idempotent: true, input }, async (_event, { input, actor, unit }) => {
  const from = input.definition === undefined && input.template ? await startFrom(input.template) : null
  const definition = from ? from.definition : input.definition === undefined ? blankDefinition() : await parseOrRefuse(input.definition)
  const id = newId('frm')
  const slug = await freeSlug(input.title)
  const at = nowMs()
  unit.add({
    sql: 'INSERT OR IGNORE INTO forms_forms (id, slug, title, mode, status, anonymous, template_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, slug, input.title, input.mode, 'draft', from?.anonymous ? 1 : 0, from ? input.template! : null, actor.accountId, at],
  }).expect(1, { code: 'forms.form.slug-taken', reason: 'Another form was given this address at the same moment.', remedy: 'Try again.' })
  unit.add({
    sql: 'INSERT INTO forms_drafts (form_id, definition, format, edit_revision, edited_by, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    params: [id, JSON.stringify(definition), definition.format, actor.accountId, at],
  })
  unit.audit({ action: 'create', record: ['forms.form', id], detail: { imported: input.definition !== undefined, ...(from ? { template: input.template! } : {}) } })
  return { formId: id, slug }
})
