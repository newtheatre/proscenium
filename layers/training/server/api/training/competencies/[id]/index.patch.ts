// Renames or redescribes a competency; its reference, and so every host's requirement, stays the same.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCompetency } from '../../../../competencies'
import { competencyChange } from '../../../../inputs'

export default defineRoute({
  ability: 'training.competency.manage',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: competencyChange,
}, async (_event, { record, input, unit }) => {
  await updateCompetency(unit.view(), record!.id, input)
  return { competencyId: record!.id }
})
