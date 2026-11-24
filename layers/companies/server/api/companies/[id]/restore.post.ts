// Rule G6 and CO-09: restores an archived company in one step, unless its name has been taken since.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireCompany, restoreCompany } from '../../../companies'

export default defineRoute({
  ability: 'companies.company.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}),
}, async (_event, { record, unit }) => {
  restoreCompany(unit, await requireCompany(record!.id))
  return { restored: true }
})
