// Changes a form's own fields: its title, its address and how long its answers are kept. The address
// it had is kept, and sends anybody who follows an old link on to the new one. Whether it is anonymous
// is fixed once it has been published, because answers already given were promised one or the other.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { SLUG_LENGTH, TITLE_LENGTH, addressTaken, requireForm } from '../../../forms'

const days = z.number().int().min(1).max(36500).nullable() // not-policy: a century, only to keep the number sane
const slug = z.string().trim().toLowerCase().min(1).max(SLUG_LENGTH).regex(/^[a-z\d]+(?:-[a-z\d]+)*$/, 'forms.form.address-shape')
const input = z.object({ slug, title: z.string().trim().min(1).max(TITLE_LENGTH), retentionDays: days, retentionDeclinedDays: days, anonymous: z.boolean(), allowEdits: z.boolean() }).partial()
const COLUMN = { slug: 'slug', title: 'title', retentionDays: 'retention_days', retentionDeclinedDays: 'retention_declined_days', anonymous: 'anonymous', allowEdits: 'allow_edits' } as const

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, unit }) => {
  const form = await requireForm(record!.id)
  if (input.anonymous !== undefined && input.anonymous !== form.anonymous && form.liveVersionId)
    refuse('forms.form.anonymous-fixed', 'Whether a form is anonymous cannot change once it has been published.', { status: 409, fields: { anonymous: 'forms.form.anonymous-fixed' } })
  const changed = (Object.keys(COLUMN) as (keyof typeof COLUMN)[]).filter(k => input[k] !== undefined && input[k] !== form[k])
  if (!changed.length) return { formId: form.id }
  if (changed.includes('slug')) {
    if (await addressTaken(input.slug!, form.id))
      refuse('forms.form.address-taken', 'Another form has that address, or used to.', { status: 409, remedy: 'Choose a different address.', fields: { slug: 'forms.form.address-taken' } })
    // Its own old address may be taken back; the one it leaves is kept for links already handed out.
    unit.add({ sql: 'DELETE FROM forms_old_addresses WHERE slug = ?', params: [input.slug!] })
    unit.add({ sql: 'INSERT OR REPLACE INTO forms_old_addresses (slug, form_id, created_at) VALUES (?, ?, ?)', params: [form.slug, form.id, nowMs()] })
  }
  const value = (k: keyof typeof COLUMN) => typeof input[k] === 'boolean' ? (input[k] ? 1 : 0) : input[k] ?? null
  unit.add({ sql: `UPDATE forms_forms SET ${changed.map(k => `${COLUMN[k]} = ?`).join(', ')} WHERE id = ?`, params: [...changed.map(value), form.id] }).expect(1)
  unit.audit({ action: 'update', record: ['forms.form', form.id], detail: { fields: changed } })
  return { formId: form.id, slug: input.slug ?? form.slug }
})
