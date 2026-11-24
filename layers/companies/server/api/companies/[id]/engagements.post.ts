// Rules E1 and E6: opens an engagement for the company, in enquiry.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireCompany } from '../../../contacts'
import { engagementInput, openEngagement } from '../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: engagementInput,
}, async (_event, { input, actor, record, unit }) => ({ engagementId: await openEngagement(unit, actor, await requireCompany(record!.id), input) }))
