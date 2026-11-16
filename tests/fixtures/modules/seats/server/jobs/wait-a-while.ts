// Answers "not yet" its first `deferTimes` runs, writing a performance each run so the test can see
// that a deferring run still commits.
import { defineJob } from '#kit'
import { performances } from '../db/schema'

export default defineJob<{ deferTimes: number, title: string }>((payload, unit, job) => {
  unit.insertSet(performances, [{ title: `${payload.title} ${job.deferrals}`, capacity: 1 }])
  if (job.deferrals < payload.deferTimes) job.defer('seats.not-yet')
})
