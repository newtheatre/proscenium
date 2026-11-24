// A crew call's Perks tab (FH-50): T-shirts by size and meals by day and need, counted now (CC4).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { perkCounts } from '../../../../../perks'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (_event, { record }) => perkCounts(record!.id!))
