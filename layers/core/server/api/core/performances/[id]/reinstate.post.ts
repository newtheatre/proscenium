// Brings a cancelled performance back, if it has not started (part 3).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { reinstatePerformance } from '../../../../programme/performances'

export default defineRoute({
  ability: 'core.performance.cancel',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => ({ id: record!.id, ...await reinstatePerformance(unit, record!.id) }))
