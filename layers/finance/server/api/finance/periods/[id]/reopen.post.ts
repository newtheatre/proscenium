// Reopens a closed period, with a reason from the theatre's list. The close stays in the history.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema } from '#kit'
import { reopenPeriod } from '../../../../close'

export default defineRoute({
  ability: 'finance.period.reopen',
  record: event => ['finance.period', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ reasonTermId: idSchema('trm') }),
}, async (_event, { input, record, unit }) => {
  await reopenPeriod(unit, record!.id, input.reasonTermId)
  return { periodId: record!.id, closed: false }
})
