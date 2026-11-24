// Takes an act out of a performance's line-up, with its credits (C-61).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { assertLineUpItemIn, removeLineUpItem } from '../../../../../../programme/line-ups'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const item = getRouterParam(event, 'item')!
  await assertLineUpItemIn(record!.id, item)
  await removeLineUpItem(unit, item)
  return { id: item }
})
