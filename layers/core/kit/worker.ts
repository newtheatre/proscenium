// The Worker's queue and scheduled handlers. The production entry (layers/core/server/entry.ts)
// wraps Nitro's fetch handler and adds these, because Nitro's own hooks run too late for
// per-message acknowledgement.
import { runInContext, type KitEnv } from './context'
import { runJob, tick } from './jobs'
import { log } from './log'

export async function handleQueue(batch: MessageBatch<{ jobId?: string }>, env: KitEnv): Promise<void> {
  for (const message of batch.messages) {
    const jobId = message.body?.jobId
    if (!jobId) {
      message.ack()
      continue
    }
    try {
      await runInContext({ env, actor: { kind: 'job' }, cache: {} }, () => runJob(jobId))
      // The job row records failures and retries; the message's work is done either way.
      message.ack()
    }
    catch (error) {
      log.error('core.queue.message-failed', { jobId, error: String((error as Error)?.message ?? error) })
      message.retry({ delaySeconds: 30 }) // not-policy: a crash before the row was read
    }
  }
}

export function handleScheduled(controller: ScheduledController, env: KitEnv, ctx: ExecutionContext): void {
  ctx.waitUntil(tick(env, controller.scheduledTime))
}
