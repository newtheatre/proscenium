// Removes one of the theatre's own templates. Forms made from it are untouched. The reply carries
// what was removed, so the screen can offer to put it back.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'

export default defineRoute({ ability: 'forms.template.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const row = await first<{ name: string, description: string | null, definition: string }>('SELECT name, description, definition FROM forms_templates WHERE id = ?', id)
  if (!row) return refuse('forms.template.not-found', 'This template is no longer there.', { status: 404 }) // not-policy: HTTP status
  unit.add({ sql: 'DELETE FROM forms_templates WHERE id = ?', params: [id] }).expect(1, { code: 'forms.template.not-found', reason: 'This template is no longer there.' })
  unit.audit({ action: 'delete', record: ['forms.template', id], detail: {} })
  return { removed: { name: row.name, description: row.description, definition: JSON.parse(row.definition) as unknown } }
})
