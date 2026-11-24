// Keep a copy, or Download CSV: queues a run of a report as the reader sees it now.
import { defineRoute } from '#kit'
import { queueRun } from '../../../runs'
import { copyAsk } from '../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  rateLimit: 'export',
  input: copyAsk,
}, async (_event, { actor, input, unit }) => {
  const { report, by, ...query } = input
  return await queueRun(unit.view(), actor, report, { ...query, ...(by ? { by: [by] } : {}) })
})
