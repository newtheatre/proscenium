// Changes a checklist and its items; an item left out is archived (FH-24).
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateChecklist } from '../../../../checklists'
import { checklistInput } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.checklist.manage',
  rateLimit: 'write',
  idempotent: true,
  input: checklistInput,
}, async (event, { input, unit }) => {
  await updateChecklist(unit.view(), getRouterParam(event, 'id', { decode: true })!, input)
  return { updated: true }
})
