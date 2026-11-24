// Saves a lesson's sections in order on the version in preparation (TR-39, O5).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { sectionsInput } from '../../../../../../inputs'
import { saveSections } from '../../../../../../lessons'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: sectionsInput,
}, async (event, { record, input, unit }) => ({ sectionIds: await saveSections(unit.view(), record!.id, getRouterParam(event, 'step')!, input.sections) }))
