// Puts a performance on sale, or resumes paused sales (BO-01, BO-05). Refused with what is missing.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { openSales } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await openSales(unit.view(), record!.id)
  return { state: 'on_sale' }
})
