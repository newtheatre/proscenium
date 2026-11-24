// Changes a saved report: its maker, or a manager.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { definitionInput, updateDefinition } from '../../../../definitions'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default', input: definitionInput }, async (event, { actor, input, unit }) => {
  await updateDefinition(unit.view(), actor, getRouterParam(event, 'id')!, input)
  return { ok: true }
})
