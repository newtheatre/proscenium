// A company's record page (part 5): its details, live contacts and engagements.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { companyDetail } from '../../../views'

export default defineRoute({
  ability: 'companies.company.view',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record }) => companyDetail(actor, record!.id))
