// Rule G6 and CO-09: archives a company, refused while it has a live engagement.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveCompany, requireCompany } from '../../../companies'

export default defineRoute({
  ability: 'companies.company.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}),
}, async (_event, { record, unit }) => {
  archiveCompany(unit, await requireCompany(record!.id))
  return { archived: true }
})
