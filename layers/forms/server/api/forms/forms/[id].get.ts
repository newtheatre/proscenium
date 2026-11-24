// A form for its builder: the form, its draft and the versions published so far.
import { getRouterParam } from 'nuxt/server'
import { all, can, defineRoute, isRefusal, today, useSetting } from '#kit'
import { accountLabel } from '#modules/core'
import type { Definition } from '../../../../shared/engine'
import { sources } from '../../../sources'
import { actionList } from '../../../actions'
import { getLink } from '../../../responses'
import { accountName, getDraft, getFields, listVersions, requireForm } from '../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (_event, { record, actor }) => {
  const form = await requireForm(record!.id)
  const [draft, versions, fields] = await Promise.all([getDraft(form.id), listVersions(form.id), getFields(form.id)])
  // The operating day, for the preview's date conditions. Unknown until the theatre's time zone is set.
  const day = await today().catch((error) => {
    if (isRefusal(error)) return null
    throw error
  })
  const live = versions.find(v => v.id === form.liveVersionId)
  const definition = JSON.parse(draft.definition) as Definition
  // For the stages editor: the roles a stage's reviewers can be the holders of, and the names of the people it names.
  const named = [...new Set((definition.workflow?.stages ?? []).flatMap(s => s.review?.reviewers.people ?? []))]
  const people: Record<string, string> = {}
  for (const id of named) people[id] = await accountLabel(id)
  const roles = await all<{ id: string, name: string }>('SELECT id, name FROM core_roles WHERE archived_at IS NULL ORDER BY fixed DESC, name')
  return {
    today: day,
    // Publishing waits on a retention period where the form asks for personal answers; nobody can answer until it is shared.
    requireRetention: await useSetting('forms.retention.require-choice'),
    shared: (await getLink(form.id)) !== null,
    form: { id: form.id, slug: form.slug, title: form.title, mode: form.mode, status: form.status, anonymous: form.anonymous, allowEdits: form.allowEdits, retentionDays: form.retentionDays, retentionDeclinedDays: form.retentionDeclinedDays, liveVersion: live?.number ?? null, createdAt: form.createdAt, archivedAt: form.archivedAt },
    draft: { definition, editRevision: draft.editRevision, editedBy: await accountName(draft.editedBy), updatedAt: draft.updatedAt },
    // What has been published of each question: its type is fixed and its data class only rises.
    fields: fields.map(f => ({ questionId: f.questionId, key: f.key, type: f.type, dataClass: f.dataClass, retired: f.retiredInVersion !== null })),
    reviewers: { roles, people },
    // Where a "record from a source" question may choose from, with the modules switched on now.
    sources: (await sources()).map(s => ({ key: s.key, label: s.label, people: !!s.people })),
    // What other modules can do when a response takes a move, for the stages editor.
    actions: await actionList(),
    canRead: (await can(actor, 'forms.response.read', ['forms.form', form.id])).allowed,
    canSaveTemplate: (await can(actor, 'forms.template.manage')).allowed,
    versions: versions.map(v => ({ id: v.id, number: v.number, publishedAt: v.publishedAt, publishedBy: v.publishedBy, summary: JSON.parse(v.changeSummary) })),
  }
})
