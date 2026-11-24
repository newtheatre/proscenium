// What publishing the draft would do (FB-207): its problems, anything that stops it, and each
// change classed safe, caution or breaking. Shown before the author confirms. Writes nothing.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getDraft, planPublish, requireForm } from '../../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  const draft = await getDraft(form.id)
  const plan = await planPublish(form, draft)
  return { editRevision: draft.editRevision, number: plan.number, unchanged: plan.unchanged, problems: plan.problems, refusals: plan.refusals, impact: plan.summary.impact, changes: plan.summary.changes }
})
