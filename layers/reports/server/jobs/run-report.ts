// Works out one copy of a report on the bulk lane (R2).
import { defineJob } from '#kit'
import { runReport } from '../runs'

export default defineJob<{ runId: string }>(async ({ runId }) => {
  await runReport(runId)
})
