// Starts a form (FB-201): blank, or from a file exported from this or another site. An imported
// definition is checked against the format like any other, and keeps its own question ids, which
// only need to be unique within the form.
import { z } from 'zod'
import { defineRoute, newId, nowMs } from '#kit'
import { TITLE_LENGTH, blankDefinition, freeSlug, parseOrRefuse } from '../../../forms'
import { FORM_MODES } from '../../../db/schema'

const input = z.object({
  title: z.string().trim().min(1).max(TITLE_LENGTH),
  mode: z.enum(FORM_MODES).default('submission'),
  definition: z.unknown().optional(),
})

export default defineRoute({ ability: 'forms.form.create', rateLimit: 'write', idempotent: true, input }, async (_event, { input, actor, unit }) => {
  const definition = input.definition === undefined ? blankDefinition() : await parseOrRefuse(input.definition)
  const id = newId('frm')
  const slug = await freeSlug(input.title)
  const at = nowMs()
  unit.add({
    sql: 'INSERT OR IGNORE INTO forms_forms (id, slug, title, mode, status, anonymous, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    params: [id, slug, input.title, input.mode, 'draft', actor.accountId, at],
  }).expect(1, { code: 'forms.form.slug-taken', reason: 'Another form was given this address at the same moment.', remedy: 'Try again.' })
  unit.add({
    sql: 'INSERT INTO forms_drafts (form_id, definition, format, edit_revision, edited_by, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    params: [id, JSON.stringify(definition), definition.format, actor.accountId, at],
  })
  unit.audit({ action: 'create', record: ['forms.form', id], detail: { imported: input.definition !== undefined } })
  return { formId: id, slug }
})
