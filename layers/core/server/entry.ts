// The Worker's entry for builds (nitro.entry under $production). Nitro serves requests; the queue
// and scheduled handlers are the kit's, because Nitro's own hooks run after the handler returns,
// too late to acknowledge or retry each message.
import nitro from 'nitropack/presets/cloudflare/runtime/cloudflare-module'
import { registry, migrations, release } from '#registry'
import { installRegistry } from '#kit/registry'
import { installMigrations } from '#kit/migrations'
import { handleQueue, handleScheduled } from '#kit/worker'
import { setEmailEventsConsumer, setEmailEventsSetAside } from '#kit/email-events'
import { setContentUpkeep } from '#kit/content-upkeep'
import { useNitroApp } from 'nitropack/runtime'
import { useContext } from '#kit'
import { emailEventsConsumer, emailEventsSetAside } from './email-events'
import { mendContentStore } from './content-store'
import type { KitEnv } from '#kit/context'
import { connectRealtime } from './realtime-hub'

// The Durable Object behind the shared rate-limit counts (binding RATE_LIMITS).
export { RateLimitCounter } from './rate-counter'
// The Durable Object behind realtime rooms (binding REALTIME).
export { RealtimeHub } from './realtime-hub'

installRegistry(registry)
installMigrations(migrations, release)
setEmailEventsConsumer(emailEventsConsumer)
setEmailEventsSetAside(emailEventsSetAside)
// Nuxt Content's own route loads a collection on first ask, so the tick asks it through Nitro.
setContentUpkeep(async (at) => {
  const { env } = useContext()
  const query = async (collection: string, sql: string) => {
    const response = await useNitroApp().localFetch(`/__nuxt_content/${collection}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  }
  await mendContentStore(env.DB, env.CACHE, at, query)
})

export default {
  ...nitro,
  // A build file (/_nuxt/...) only reaches the Worker when the static assets have no such file:
  // for a few seconds during a deploy, when a page and its scripts come from different versions, or
  // for an old page asking for a file the new build no longer has. Nitro answers with its route
  // rule's year-long immutable cache header, and the browser would keep that failure: the page
  // never starts, so no button works, even after a reload. A missing build file is never cached.
  async fetch(request: Request, env: KitEnv, ctx: ExecutionContext) {
    // A socket for news (#kit/realtime) goes to its room; Nitro cannot hand a socket back.
    if (new URL(request.url).pathname === '/api/realtime') return connectRealtime(request, env)
    const response = await nitro.fetch!(request as Parameters<NonNullable<typeof nitro.fetch>>[0], env, ctx)
    if (response.status !== 404 || !new URL(request.url).pathname.startsWith('/_nuxt/')) return response // not-policy: HTTP's "not found"
    const headers = new Headers(response.headers)
    headers.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
  // The job lanes and EMAIL_EVENTS; handleQueue tells them apart by the batch's queue name.
  async queue(batch: MessageBatch<{ jobId?: string }>, env: KitEnv) {
    await handleQueue(batch, env)
  },
  scheduled(controller: ScheduledController, env: KitEnv, ctx: ExecutionContext) {
    handleScheduled(controller, env, ctx)
  },
}
