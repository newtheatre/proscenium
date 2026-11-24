// The Worker's entry for builds (nitro.entry under $production). Nitro serves requests; the queue
// and scheduled handlers are the kit's, because Nitro's own hooks run after the handler returns,
// too late to acknowledge or retry each message.
import { useNitroApp } from 'nitro/app'
import { registry, migrations, release } from '#registry'
import { installRegistry } from '#kit/registry'
import { installMigrations } from '#kit/migrations'
import { handleQueue, handleScheduled } from '#kit/worker'
import { setEmailEventsConsumer, setEmailEventsSetAside } from '#kit/email-events'
import { setContentUpkeep } from '#kit/content-upkeep'
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
    const response = await useNitroApp().fetch(new Request(`http://localhost/__nuxt_content/${collection}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  }
  await mendContentStore(env.DB, env.CACHE, at, query)
})

export default {
  // A build file (/_nuxt/...) only reaches the Worker when the static assets have no such file:
  // for a few seconds during a deploy, when a page and its scripts come from different versions, or
  // for an old page asking for a file the new build no longer has. Nitro answers with its route
  // rule's year-long immutable cache header, and the browser would keep that failure: the page
  // never starts, so no button works, even after a reload. A missing build file is never cached.
  async fetch(request: Request, env: KitEnv, ctx: ExecutionContext) {
    // A socket for news (#kit/realtime) goes to its room; Nitro cannot hand a socket back.
    if (new URL(request.url).pathname === '/api/realtime') return connectRealtime(request, env)
    // Nitro v3 does not export the Cloudflare preset's handler, so this does what its fetch does.
    ;(globalThis as { __env__?: unknown }).__env__ = env
    const req = request as Request & { runtime?: Record<string, unknown>, waitUntil?: unknown, ip?: string }
    req.ip = request.headers.get('cf-connecting-ip') ?? undefined
    req.runtime = { name: 'cloudflare', cloudflare: { env, context: ctx } }
    req.waitUntil = ctx.waitUntil.bind(ctx)
    const response = await useNitroApp().fetch(request)
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
