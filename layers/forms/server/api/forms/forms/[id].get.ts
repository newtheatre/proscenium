// A form for its builder: the form, its draft and the versions published so far.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { accountName, getDraft, listVersions, requireForm } from '../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  const [draft, versions] = await Promise.all([getDraft(form.id), listVersions(form.id)])
  const live = versions.find(v => v.id === form.liveVersionId)
  return {
    form: { id: form.id, slug: form.slug, title: form.title, mode: form.mode, status: form.status, anonymous: form.anonymous, retentionDays: form.retentionDays, retentionDeclinedDays: form.retentionDeclinedDays, liveVersion: live?.number ?? null, createdAt: form.createdAt, archivedAt: form.archivedAt },
    draft: { definition: JSON.parse(draft.definition), editRevision: draft.editRevision, editedBy: await accountName(draft.editedBy), updatedAt: draft.updatedAt },
    versions: versions.map(v => ({ id: v.id, number: v.number, publishedAt: v.publishedAt, publishedBy: v.publishedBy, summary: JSON.parse(v.changeSummary) })),
  }
})
