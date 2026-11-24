// The Worker's server entry (Nitro's `serverEntry`). Its named exports are exported from the Worker, so
// the Durable Objects live here; its default export sees each request before the renderer does. The
// queue and cron handlers are plugins/03.worker.ts.
import { env } from 'cloudflare:workers'
import type { KitEnv } from '#kit/context'
import { connectRealtime } from './realtime-hub'

// The Durable Object behind the shared rate-limit counts (binding RATE_LIMITS).
export { RateLimitCounter } from './rate-counter'
// The Durable Object behind realtime rooms (binding REALTIME).
export { RealtimeHub } from './realtime-hub'

export default {
  fetch(request: Request) {
    // A socket for news (#kit/realtime) goes to its room; Nitro cannot hand a socket back.
    if (new URL(request.url).pathname === '/api/realtime') return connectRealtime(request, env as unknown as KitEnv)
  },
}
