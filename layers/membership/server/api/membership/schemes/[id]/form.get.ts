// The application form a scheme asks applicants to answer (MEM-12), for the join form: its
// definition while it takes answers, with any answers this person had started. Null when the
// scheme has no form.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { slotForms } from '#modules/forms'
import { APPLICATION_SLOT, requireScheme } from '../../../../schemes'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const scheme = await requireScheme(getRouterParam(event, 'id'))
  if (scheme.state !== 'open') refuse('core.not-found', 'There is no such scheme.', { status: 404 }) // not-policy: HTTP status
  const { today, forms } = await slotForms(APPLICATION_SLOT, scheme.id, actor)
  const form = forms.find(f => f.state === 'open') ?? forms[0] ?? null
  return { today, form }
})
