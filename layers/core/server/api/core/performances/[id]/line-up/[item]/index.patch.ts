// Changes an act's name, note, set time, length or whether it is announced (C-61; LU1).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { assertLineUpItemIn, updateLineUpItem } from '../../../../../../programme/line-ups'
import { inInstants } from '../../../../../../programme/performances'
import { lineUpPatch } from '../../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: lineUpPatch,
}, async (event, { unit, record, input }) => {
  const item = getRouterParam(event, 'item')!
  await assertLineUpItemIn(record!.id, item)
  await updateLineUpItem(unit, item, await inInstants(input))
  return { id: item }
})
