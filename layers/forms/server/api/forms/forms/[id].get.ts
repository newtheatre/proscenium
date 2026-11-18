// A form for its builder: the form, its draft and the versions published so far.
import { getRouterParam } from 'h3'
import { defineRoute, isRefusal, today } from '#kit'
import { accountName, getDraft, getFields, listVersions, requireForm } from '../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  const [draft, versions, fields] = await Promise.all([getDraft(form.id), listVersions(form.id), getFields(form.id)])
  // The operating day, for the preview's date conditions. Unknown until the theatre's time zone is set.
  const day = await today().catch((error) => {
    if (isRefusal(error)) return null
    throw error
  })
  const live = versions.find(v => v.id === form.liveVersionId)
  return {
    today: day,
    form: { id: form.id, slug: form.slug, title: form.title, mode: form.mode, status: form.status, anonymous: form.anonymous, retentionDays: form.retentionDays, retentionDeclinedDays: form.retentionDeclinedDays, liveVersion: live?.number ?? null, createdAt: form.createdAt, archivedAt: form.archivedAt },
    draft: { definition: JSON.parse(draft.definition), editRevision: draft.editRevision, editedBy: await accountName(draft.editedBy), updatedAt: draft.updatedAt },
    // What has been published of each question: its type is fixed and its data class only rises.
    fields: fields.map(f => ({ questionId: f.questionId, key: f.key, type: f.type, dataClass: f.dataClass, retired: f.retiredInVersion !== null })),
    versions: versions.map(v => ({ id: v.id, number: v.number, publishedAt: v.publishedAt, publishedBy: v.publishedBy, summary: JSON.parse(v.changeSummary) })),
  }
})
