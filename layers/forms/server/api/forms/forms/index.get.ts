// The forms this person may build: every form for someone who holds forms.form.edit site-wide, and
// otherwise their own and those shared with them.
import { can, defineRoute } from '#kit'
import { listForms } from '../../../forms'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const forms = []
  for (const form of await listForms()) {
    if (!(await can(actor, 'forms.form.edit', ['forms.form', form.id])).allowed) continue
    forms.push({ id: form.id, slug: form.slug, title: form.title, mode: form.mode, status: form.status, published: form.liveVersionId !== null, createdAt: form.createdAt, archivedAt: form.archivedAt })
  }
  return { forms }
})
