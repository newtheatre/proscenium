// Fails its first `failTimes` attempts, then succeeds.
import { defineJob } from '#kit'

export default defineJob<{ failTimes: number }>((payload, _unit, job) => {
  if (job.attempts <= payload.failTimes) throw new Error(`attempt ${job.attempts} fails on purpose`)
})
