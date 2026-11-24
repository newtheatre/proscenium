// One collection with its productions in order, drafts included (C-60).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { collectionImage, getCollection } from '../../../../programme/collections'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ ...await getCollection(record!.id), image: await collectionImage(record!.id) }))
