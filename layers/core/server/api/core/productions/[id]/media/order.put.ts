// Puts a production's photos in the order given.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { orderPhotos } from '../../../../../programme/media'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ fileIds: z.array(z.string().min(1)).max(200) }), // not-policy: a sane bound on one request
}, async (_event, { input, unit, record }) => {
  await orderPhotos(unit, record!.id, input.fileIds)
  return { id: record!.id }
})
