// Edits a rota template and replaces its lines. Shifts made from it are not changed.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateTemplate } from '../../../../templates'
import { templateInput } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  input: templateInput,
}, async (event, { input, unit }) => {
  await updateTemplate(unit.view(), getRouterParam(event, 'id', { decode: true })!, input)
  return { templateId: getRouterParam(event, 'id', { decode: true }) }
})
