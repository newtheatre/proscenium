// A production's poster, photos, uploads not yet in use and removed files that can be put back.
import { getRouterParam } from 'h3'
import { defineRoute, nowMs } from '#kit'
import { productionMedia } from '../../../../../programme/media'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => productionMedia(record!.id, nowMs()))
