// The form's own link: who may answer, when, how many, and how often. Null until it is given one.
import { getRouterParam } from 'h3'
import { defineRoute, siteUrl } from '#kit'
import { requireForm } from '../../../../forms'
import { getLink } from '../../../../responses'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  return { link: await getLink(form.id), address: await siteUrl(`/forms/${form.slug}`), published: form.liveVersionId !== null }
})
