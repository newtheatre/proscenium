// The form as a file (FB-510, brought forward): its draft definition with its title and mode, to
// keep or to import into this or another site with New form. No answers and no ids of this site.
import { getRouterParam, setResponseHeader } from 'h3'
import { defineRoute } from '#kit'
import { authorDefinition, getDraft, requireForm } from '../../../../forms'
import type { Definition } from '../../../../../shared/engine'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default' }, async (event, { record, actor }) => {
  const form = await requireForm(record!.id)
  const draft = await getDraft(form.id)
  setResponseHeader(event, 'content-disposition', `attachment; filename="${form.slug}.form.json"`)
  return { file: 'proscenium.form', fileVersion: 1, title: form.title, mode: form.mode, definition: await authorDefinition(JSON.parse(draft.definition) as Definition, actor, form.id) }
})
