// Replaces a performance's access features (C-10).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setPerformanceAccess } from '../../../../programme/performances'
import { accessInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: accessInput,
}, async (_event, { unit, record, input }) => {
  await setPerformanceAccess(unit, record!.id, input.features)
  return { id: record!.id }
})
