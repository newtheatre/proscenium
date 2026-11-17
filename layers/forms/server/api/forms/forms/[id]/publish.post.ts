// Publishes the draft as the form's next version (FB-207). The version is immutable from here: the
// database refuses any change to it. A change that retires a question needs `confirm`.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { getDraft, planPublish, refuseUnpublishable, requireForm, writePublish } from '../../../../forms'

const input = z.object({ editRevision: z.number().int().min(0), confirm: z.boolean().default(false) })

export default defineRoute({ ability: 'forms.form.publish', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', idempotent: true, input }, async (_event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  if (form.archivedAt !== null) refuse('forms.form.archived', 'This form is archived, so it cannot be published.', { status: 409, remedy: 'Restore it first.' })
  const draft = await getDraft(form.id)
  if (draft.editRevision !== input.editRevision)
    refuse('forms.draft.stale', 'The form has changed since you looked at what publishing would do.', { status: 409, remedy: 'Look at the changes and publish again.' })
  const plan = await planPublish(form, draft)
  refuseUnpublishable(plan, input.confirm)
  const versionId = newId('fver')
  writePublish(unit, form, draft, plan, versionId, actor.accountId!, nowMs())
  unit.audit({ action: 'publish', record: ['forms.form', form.id], detail: { version: plan.number, impact: plan.summary.impact } })
  return { versionId, number: plan.number, impact: plan.summary.impact }
})
