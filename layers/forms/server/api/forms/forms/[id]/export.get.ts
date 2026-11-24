// The form as a file (FB-510, brought forward): its draft definition with its title and mode, to
// keep or to import into this or another site with New form. No answers and no ids of this site.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getDraft, requireForm } from '../../../../forms'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (event, { record }) => {
  const form = await requireForm(record!.id)
  const draft = await getDraft(form.id)
  event.res.headers.set('content-disposition', `attachment; filename="${form.slug}.form.json"`)
  return { file: 'proscenium.form', fileVersion: 1, title: form.title, mode: form.mode, definition: JSON.parse(draft.definition) }
})
