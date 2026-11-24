// Publishes, unpublishes, archives or restores a collection (C-60, part 3's table).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { moveCollection } from '../../../../programme/collections'

export default defineRoute({
  ability: 'core.collection.manage',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ to: z.enum(['draft', 'published', 'archived']) }),
}, async (_event, { input, unit, record }) => {
  await moveCollection(unit, record!.id, input.to)
  return { id: record!.id, state: input.to }
})
