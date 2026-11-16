// Cancels a job that is still waiting to run (Jobs screen). Running, finished and dead jobs stay.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { cancelJob } from '#kit/jobs'

export default defineRoute({
  ability: 'core.job.manage',
  record: event => ['core.job', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { unit, record }) => {
  await cancelJob(unit, record!.id)
  return { jobId: record!.id, state: 'cancelled' }
})
