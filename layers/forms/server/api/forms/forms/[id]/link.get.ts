// The form's own link: who may answer, when, how many, and how often. Null until it is given one.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, siteUrl } from '#kit'
import type { Definition } from '../../../../../shared/engine/types'
import { actions } from '../../../../actions'
import { getVersion, requireForm } from '../../../../forms'
import { getLink } from '../../../../responses'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (_event, { record }) => {
  const form = await requireForm(record!.id)
  // What a move does only where the form is attached to a record: shared by this link, it is skipped.
  const live = await getVersion(form.liveVersionId)
  const used = new Set(((live ? JSON.parse(live.definition) as Definition : null)?.workflow?.transitions ?? []).flatMap(t => (t.actions ?? []).map(a => a.action)))
  const elsewhere = (await actions()).filter(a => a.slot && used.has(a.key)).map(a => a.label)
  return { link: await getLink(form.id), address: await siteUrl(`/forms/${form.slug}`), published: form.liveVersionId !== null, elsewhere }
})
