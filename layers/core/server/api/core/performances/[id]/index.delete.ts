// Deletes a draft performance. A scheduled one is cancelled instead.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deletePerformance } from '../../../../programme/performances'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await deletePerformance(unit, record!.id)
  return { id: record!.id }
})
