// Makes a competency active; making it active needs an active route with an item (R1).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setCompetencyStatus } from '../../../../competencies'

export default defineRoute({
  ability: 'training.competency.manage',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await setCompetencyStatus(unit.view(), record!.id, 'active')
  return { competencyId: record!.id }
})
