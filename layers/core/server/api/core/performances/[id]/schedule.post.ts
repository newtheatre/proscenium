// Draft to scheduled, so the public can see it (C-05).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { schedulePerformance } from '../../../../programme/performances'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => ({ id: record!.id, ...await schedulePerformance(unit, record!.id) }))
