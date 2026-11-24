// Rule G1: adds a company; a name already used by an unarchived company refuses, naming it.
import { defineRoute } from '#kit'
import { companyInput, createCompany } from '../../contacts'

export default defineRoute({
  ability: 'companies.company.manage',
  rateLimit: 'write',
  idempotent: true,
  input: companyInput,
}, async (_event, { input, actor, unit }) => ({ companyId: await createCompany(unit, actor, input) }))
