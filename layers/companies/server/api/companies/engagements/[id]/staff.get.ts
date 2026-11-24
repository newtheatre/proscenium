// One engagement for its staff page (part 5): the outline, its production and its history.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { engagementDetail } from '../../../../views'

export default defineRoute({
  ability: 'companies.engagement.view',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record }) => engagementDetail(actor, record!.id))
