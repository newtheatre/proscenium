// Closes a period. Once closed nothing can be posted into it; late facts land in the next open one.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { closePeriod } from '../../../../close'

export default defineRoute({
  ability: 'finance.period.close',
  record: event => ['finance.period', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await closePeriod(unit, record!.id)
  return { periodId: record!.id, closed: true }
})
