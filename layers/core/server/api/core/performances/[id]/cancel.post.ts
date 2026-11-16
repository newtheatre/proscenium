// Cancels a scheduled performance with a reason (C-06). Any module may refuse it first.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { cancelPerformance } from '../../../../programme/performances'
import { cancelInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.cancel',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: cancelInput,
}, async (_event, { unit, record, input, actor }) => {
  await cancelPerformance(unit, record!.id, input, actor)
  return { id: record!.id }
})
