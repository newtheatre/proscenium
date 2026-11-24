// One published version, to read as it was: its definition, never changed since it was published.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, first, isRefusal, refuse, today } from '#kit'
import { requireForm } from '../../../../../forms'
import type { Definition } from '../../../../../../shared/engine'

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (event, { record }) => {
  const form = await requireForm(record!.id)
  const number = Number(getRouterParam(event, 'number', { decode: true }))
  const row = Number.isInteger(number) ? await first<{ definition: string }>('SELECT definition FROM forms_versions WHERE form_id = ? AND number = ?', form.id, number) : null
  if (!row) return refuse('forms.version.not-found', 'This form has no such version.', { status: 404 }) // not-policy: HTTP status
  // The operating day, for the conditions that read it. Unknown until the theatre's time zone is set.
  const day = await today().catch((error) => {
    if (isRefusal(error)) return null
    throw error
  })
  return { number, today: day, definition: JSON.parse(row.definition) as Definition }
})
