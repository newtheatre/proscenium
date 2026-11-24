// Takes a file off a production, or discards an upload not yet used. It can be put back until
// core.files.deleted-retention has passed.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeMedia } from '../../../../../../programme/media'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const fileId = getRouterParam(event, 'fileId', { decode: true }) ?? ''
  await removeMedia(unit, record!.id, fileId)
  return { id: fileId }
})
