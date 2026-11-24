// A new time, place, capacity or detail (C-07). On a scheduled performance the scheduling guards
// apply again and each kind of change is announced.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { inInstants } from '../../../../programme/performances'
import { updatePerformance } from '../../../../programme/performances-update'
import { performancePatch } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: performancePatch,
}, async (_event, { unit, record, input, actor }) => ({ id: record!.id, ...await updatePerformance(unit, record!.id, await inInstants(input), actor) }))
