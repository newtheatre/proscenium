// Adds one performance to a production, as a draft (C-03).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { createPerformance, inInstants, type PerformanceInput } from '../../../../../programme/performances'
import { performanceInput } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: performanceInput,
}, async (_event, { unit, record, input, actor }) => ({ id: await createPerformance(unit, record!.id, await inInstants<PerformanceInput>(input), { actorId: actor.accountId ?? null }) }))
