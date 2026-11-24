// A performance's line-up in order, and its credits for that date (C-61).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { lineUpsFor } from '../../../../../programme/line-ups'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ items: (await lineUpsFor([record!.id])).get(record!.id) ?? [] }))
