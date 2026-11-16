// The Worker's entry for builds (nitro.entry under $production). Nitro serves requests; the queue
// and scheduled handlers are the kit's, because Nitro's own hooks run after the handler returns,
// too late to acknowledge or retry each message.
import nitro from 'nitropack/presets/cloudflare/runtime/cloudflare-module'
import { registry, migrations, release } from '#registry'
import { installRegistry } from '#kit/registry'
import { installMigrations } from '#kit/migrations'
import { handleQueue, handleScheduled } from '#kit/worker'
import type { KitEnv } from '#kit/context'

// The Durable Object behind the shared rate-limit counts (binding RATE_LIMITS).
export { RateLimitCounter } from './rate-counter'

installRegistry(registry)
installMigrations(migrations, release)

export default {
  ...nitro,
  async queue(batch: MessageBatch<{ jobId?: string }>, env: KitEnv) {
    await handleQueue(batch, env)
  },
  scheduled(controller: ScheduledController, env: KitEnv, ctx: ExecutionContext) {
    handleScheduled(controller, env, ctx)
  },
}
