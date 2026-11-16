// Sending job messages to the two lanes. The job row is the truth (J1): a message only says "look
// at this job", so a lost message is recovered by the sweep and a duplicate is claimed once.
import { useContext } from './context'
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

export async function dispatch(messages: JobMessage[]): Promise<void> {
  if (!messages.length) return
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
    try {
      await queue.sendBatch(batch.map(m => ({ body: { jobId: m.jobId }, delaySeconds: m.delaySeconds ? Math.min(MAX_DELAY, Math.ceil(m.delaySeconds)) : undefined })))
    }
    catch (error) {
      // The sweep sends it again; the job row is unaffected.
      log.error('core.jobs.send-failed', { lane, error: String(error) })
    }
  }
}
