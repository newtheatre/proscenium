// The test Worker's entry. Tests call the kit directly; this only has to exist, and export the
// Durable Object classes the bindings name.
export { RateLimitCounter } from '../../layers/core/server/rate-counter'
export { RealtimeHub } from '../../layers/core/server/realtime-hub'

export default {
  async fetch() {
    return new Response('proscenium tests')
  },
}
