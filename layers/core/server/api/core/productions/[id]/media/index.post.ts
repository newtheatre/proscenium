// Uses an uploaded file: as the poster, setting the old one aside, or after the last photo. A public
// image needs its description first (C-23).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useMedia } from '../../../../../programme/media'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ fileId: z.string().min(1) }),
}, async (_event, { input, unit, record }) => {
  await useMedia(unit, record!.id, input.fileId)
  return { id: input.fileId }
})
