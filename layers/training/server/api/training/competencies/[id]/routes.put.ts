// Saves a competency's routes in order and answers how many held it before and hold it after (R9, TR-35).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { holderCount, saveRoutes } from '../../../../competencies'
import { routesInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.competency.manage',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: routesInput,
}, async (_event, { record, input, unit }) => {
  const before = await holderCount(record!.id)
  await saveRoutes(unit.view(), record!.id, input.routes)
  await unit.commit()
  return { competencyId: record!.id, holders: { before, after: await holderCount(record!.id) } }
})
