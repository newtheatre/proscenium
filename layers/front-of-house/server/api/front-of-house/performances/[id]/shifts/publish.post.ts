// Publishes every draft shift of this performance together (FH-07, "Publish all").
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { shiftsOf } from '../../../../../shifts'
import { publishShifts } from '../../../../../rota'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  const drafts = (await shiftsOf(record!.id!)).filter(s => s.state === 'draft')
  await publishShifts(unit.view(), drafts)
  return { published: drafts.length }
})
