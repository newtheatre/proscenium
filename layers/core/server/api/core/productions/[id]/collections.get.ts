// The collections a production is in, for the picker on its record (C-60).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { collectionsFor } from '../../../../programme/collections'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ collections: (await collectionsFor([record!.id])).get(record!.id) ?? [] }))
