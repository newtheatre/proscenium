// One performance, with its production, venue, space and access features.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { capacityOf, getPerformance } from '../../../../programme/performances'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ ...await getPerformance(record!.id), houseCapacity: await capacityOf(record!.id) }))
