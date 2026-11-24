// Sending job messages to the two lanes. The job row is the truth (J1): a message only says "look
// at this job", so a lost message is recovered by the sweep and a duplicate is claimed once.
import { runInContext, useContext } from './context'
import { log } from './log'

export type Lane = 'prompt' | 'bulk'
export interface JobMessage { jobId: string, lane: Lane, delaySeconds?: number }
export type Dispatcher = (messages: JobMessage[]) => Promise<void>

let override: Dispatcher | undefined

/** Replace the queues: tests record messages, `nuxt dev` runs jobs in-process. */
export function setDispatcher(dispatcher: Dispatcher | undefined): void {
  override = dispatcher
}

const MAX_DELAY = 43_200 // not-policy: the longest delay Cloudflare Queues accepts, in seconds
const MAX_BATCH = 100 // not-policy: the most messages Cloudflare Queues takes in one sendBatch

export async function dispatch(messages: JobMessage[]): Promise<void> {
  if (!messages.length) return
  if (useContext().practice) return runInStore(messages)
  if (override) return override(messages)
  const env = useContext().env
  for (const lane of ['prompt', 'bulk'] as const) {
    const batch = messages.filter(m => m.lane === lane)
    if (!batch.length) continue
    const queue = lane === 'bulk' ? env.JOBS_BULK : env.JOBS_PROMPT
    if (!queue) {
      log.warn('core.jobs.no-queue', { lane, jobs: batch.length })
      continue
    }
    // A set announced in one unit can make hundreds of jobs (U8); Queues takes a hundred at a time.
    for (let start = 0; start < batch.length; start += MAX_BATCH) {
      try {
        await queue.sendBatch(batch.slice(start, start + MAX_BATCH).map(m => ({ body: { jobId: m.jobId }, delaySeconds: m.delaySeconds ? Math.min(MAX_DELAY, Math.ceil(m.delaySeconds)) : undefined })))
      }
      catch (error) {
        // The sweep sends it again; the job row is unaffected.
        log.error('core.jobs.send-failed', { lane, error: String(error) })
      }
    }
  }
}

let runJob: ((jobId: string) => Promise<unknown>) | undefined

/** How a job is run in a store: jobs.ts says so when it loads, so this file never imports it. */
export function setStoreJobRunner(runner: (jobId: string) => Promise<unknown>): void {
  runJob = runner
}

/**
 * In practice a job runs in the store after the response, under the same session (O4): nothing
 * reaches the real queues. A delayed job waits for the trainee's "Run now" instead.
 */
async function runInStore(messages: JobMessage[]): Promise<void> {
  const { env, practice, waitUntil } = useContext()
  if (!runJob) throw new Error('No job runner: jobs.ts has not loaded')
  const run = runJob
  const due = messages.filter(m => !m.delaySeconds)
  const running = (async () => {
    for (const message of due) {
      await runInContext({ env, practice, actor: { kind: 'job' }, cache: {} }, () => run(message.jobId))
        .catch(error => log.error('core.practice.job-failed', { jobId: message.jobId, error: String((error as Error)?.message ?? error) }))
    }
  })()
  // After the response where the platform allows it; a test, with no waitUntil, sees them done.
  if (waitUntil) waitUntil(running)
  else await running
}
