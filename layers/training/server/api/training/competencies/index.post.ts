// Creates a competency, retired until it has a route to hold it by (R1, TR-35).
import { defineRoute } from '#kit'
import { createCompetency } from '../../../competencies'
import { competencyInput } from '../../../inputs'

export default defineRoute({
  ability: 'training.competency.manage',
  rateLimit: 'write',
  idempotent: true,
  input: competencyInput,
}, async (_event, { input, unit }) => ({ competencyId: await createCompetency(unit.view(), input) }))
