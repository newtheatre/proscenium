// Version history (screen 9): each version published, newest first, with who published it, what
// changed from the one before and how many responses were sent on it.
import { getRouterParam } from 'h3'
import { all, defineRoute } from '#kit'
import { accountName, getDraft, listVersions, requireForm, type ChangeSummary } from '../../../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  const [versions, draft] = await Promise.all([listVersions(form.id), getDraft(form.id)])
  const counts = new Map((await all<{ versionId: string, n: number }>('SELECT version_id AS versionId, count(*) AS n FROM forms_responses WHERE form_id = ? AND state = \'submitted\' GROUP BY version_id', form.id)).map(r => [r.versionId, r.n]))
  const names = new Map<string, string | null>()
  for (const id of new Set(versions.map(v => v.publishedBy))) names.set(id, await accountName(id))
  return {
    form: { id: form.id, title: form.title, status: form.status, archived: form.archivedAt !== null },
    editRevision: draft.editRevision,
    versions: versions.map(v => ({
      number: v.number,
      live: v.id === form.liveVersionId,
      publishedAt: v.publishedAt,
      publishedBy: names.get(v.publishedBy) ?? null,
      responses: counts.get(v.id) ?? 0,
      summary: JSON.parse(v.changeSummary) as ChangeSummary,
    })),
  }
})
