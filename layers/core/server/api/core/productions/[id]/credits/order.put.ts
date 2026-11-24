// Puts one section's credits in a new order. The list names every credit in the section.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { reorderCredits } from '../../../../../programme/credits'
import { creditOrderInput } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: creditOrderInput,
}, async (_event, { input, unit, record }) => {
  await reorderCredits(unit, record!.id, input.sectionTermId, input.ids)
  return { id: record!.id }
})
