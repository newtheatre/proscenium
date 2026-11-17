// Changes a form's own fields: its title and how long its answers are kept. Whether it is anonymous
// is fixed once it has been published, because answers already given were promised one or the other.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { TITLE_LENGTH, requireForm } from '../../../forms'

const days = z.number().int().min(1).max(36500).nullable() // not-policy: a century, only to keep the number sane
const input = z.object({ title: z.string().trim().min(1).max(TITLE_LENGTH), retentionDays: days, retentionDeclinedDays: days, anonymous: z.boolean() }).partial()
const COLUMN = { title: 'title', retentionDays: 'retention_days', retentionDeclinedDays: 'retention_declined_days', anonymous: 'anonymous' } as const

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, unit }) => {
  const form = await requireForm(record!.id)
  if (input.anonymous !== undefined && input.anonymous !== form.anonymous && form.liveVersionId)
    refuse('forms.form.anonymous-fixed', 'Whether a form is anonymous cannot change once it has been published.', { status: 409, fields: { anonymous: 'forms.form.anonymous-fixed' } })
  const changed = (Object.keys(COLUMN) as (keyof typeof COLUMN)[]).filter(k => input[k] !== undefined && input[k] !== form[k])
  if (!changed.length) return { formId: form.id }
  const value = (k: keyof typeof COLUMN) => typeof input[k] === 'boolean' ? (input[k] ? 1 : 0) : input[k] ?? null
  unit.add({ sql: `UPDATE forms_forms SET ${changed.map(k => `${COLUMN[k]} = ?`).join(', ')} WHERE id = ?`, params: [...changed.map(value), form.id] }).expect(1)
  unit.audit({ action: 'update', record: ['forms.form', form.id], detail: { fields: changed } })
  return { formId: form.id }
})
