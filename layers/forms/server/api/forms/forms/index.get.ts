// The forms this person may build or read the responses of: every form for someone who holds the
// ability site-wide, and otherwise their own and those shared with them.
import { all, can, defineRoute } from '#kit'
import { listForms } from '../../../forms'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const forms = []
  const counts = new Map((await all<{ formId: string, n: number }>('SELECT form_id AS formId, COUNT(*) AS n FROM forms_responses WHERE state = \'submitted\' GROUP BY form_id')).map(r => [r.formId, r.n]))
  for (const form of await listForms()) {
    const canEdit = (await can(actor, 'forms.form.edit', ['forms.form', form.id])).allowed
    const canRead = (await can(actor, 'forms.response.read', ['forms.form', form.id])).allowed
    if (!canEdit && !canRead) continue
    forms.push({ canEdit, canRead, id: form.id, slug: form.slug, title: form.title, mode: form.mode, status: form.status, published: form.liveVersionId !== null, responses: canRead ? counts.get(form.id) ?? 0 : null, createdAt: form.createdAt, archivedAt: form.archivedAt })
  }
  return { forms }
})
