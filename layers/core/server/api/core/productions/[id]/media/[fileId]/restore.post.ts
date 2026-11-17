// Puts a removed poster or photo back (C-24). A poster put back sets the current one aside.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { restoreMedia } from '../../../../../../programme/media'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const fileId = getRouterParam(event, 'fileId') ?? ''
  await restoreMedia(unit, record!.id, fileId)
  return { id: fileId }
})
