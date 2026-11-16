// Daily: removes finished jobs, task runs and idempotency keys older than their settings allow.
import { defineTask, nowMs, useSetting } from '#kit'

export default defineTask(async (unit) => {
  const at = nowMs()
  const keepJobs = await useSetting('core.jobs.keep-for') as number
  const keepKeys = await useSetting('core.idempotency.keep-for') as number
  const jobsBefore = at - keepJobs * 1000 // not-policy: seconds to milliseconds
  unit.add({ sql: "DELETE FROM core_jobs WHERE state IN ('done', 'cancelled') AND finished_at < ?", params: [jobsBefore] })
  unit.add({ sql: 'DELETE FROM core_task_runs WHERE finished_at < ?', params: [jobsBefore] })
  unit.add({ sql: 'DELETE FROM core_idempotency_keys WHERE created_at < ?', params: [at - keepKeys * 1000] }) // not-policy: seconds to milliseconds
})
