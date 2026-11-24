// Changes a company's details; a new name keeps rule G1.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { detailsInput, requireCompany, updateCompany } from '../../../companies'

export default defineRoute({
  ability: 'companies.company.manage',
  record: event => ['companies.company', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: detailsInput,
}, async (_event, { input, record, unit }) => {
  await updateCompany(unit, await requireCompany(record!.id), input)
  return { saved: true }
})
