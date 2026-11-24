// Keep a copy, or Download CSV: queues a run of a report as the reader sees it now.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { queueRun } from '../../../runs'
import { dateParam, keyParam, periodParam, scopeParam } from '../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  rateLimit: 'export',
  input: z.object({ report: z.string().max(80), scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional(), by: keyParam.optional() }), // not-policy: a report id's length
}, async (_event, { actor, input, unit }) => {
  const { report, by, ...query } = input
  return await queueRun(unit.view(), actor, report, { ...query, ...(by ? { by: [by] } : {}) })
})
