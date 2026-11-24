// Moves an act to follow another, or to the top when `after` is null (C-61).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { assertLineUpItemIn, moveLineUpItem } from '../../../../../../programme/line-ups'
import { lineUpMove } from '../../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: lineUpMove,
}, async (event, { unit, record, input }) => {
  const item = getRouterParam(event, 'item')!
  await assertLineUpItemIn(record!.id, item)
  await moveLineUpItem(unit, item, input)
  return { id: item }
})
