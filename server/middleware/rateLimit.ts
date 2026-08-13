/**
 * Rate limiting for the endpoints anyone can reach without a session.
 *
 * Declared here against route patterns rather than called from each handler, so
 * a new public route is covered by adding a line to one table instead of by
 * remembering. `server/utils/rateLimit.ts` had been written, tested and then
 * never called from anywhere — the limiter existed, the limits did not, and its
 * comments read as though protection were in place.
 *
 * Buckets are per-IP via `CF-Connecting-IP` (set by the edge, not spoofable by
 * the client). Limits are deliberately generous: student halls and the theatre's
 * own wifi put many genuine customers behind one address, so these are sized to
 * stop a script, not to police a busy on-sale. The narrower abuse case — using
 * guest checkout to send mail to an address the attacker chose — is bounded per
 * email address inside the booking handler, where the address is known.
 */

import type { H3Event } from 'h3'

interface PublicRoute {
  /** Bucket name; also what appears in the D1 key. */
  name: string
  methods: string[]
  pattern: RegExp
  limit: number
  windowSeconds: number
  message?: string
}

const PUBLIC_ROUTES: PublicRoute[] = [
  {
    // Unauthenticated, and each call creates a shadow account upstream, writes a
    // reservation with tickets, and sends an email.
    name: 'booking-create',
    methods: ['POST'],
    pattern: /^\/api\/bookings\/?$/,
    limit: 30,
    windowSeconds: 600,
    message: 'That is a lot of bookings from one place in a short time. Please wait a few minutes, or call the box office.',
  },
  {
    // Guest booking access is a signed token in `?t=`. Forging one means trying
    // signatures, so cap how fast that can be attempted.
    name: 'booking-read',
    methods: ['GET'],
    pattern: /^\/api\/bookings\/[^/]+\/?$/,
    limit: 120,
    windowSeconds: 600,
  },
  {
    // Same token, but these change a booking.
    name: 'booking-mutate',
    methods: ['POST', 'PUT'],
    pattern: /^\/api\/bookings\/[^/]+\/(cancel|tickets)\/?$/,
    limit: 60,
    windowSeconds: 600,
  },
]

export default defineEventHandler(async (event: H3Event) => {
  // `event.path` carries the query string; match on the pathname only.
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return

  const method = event.method.toUpperCase()
  const route = PUBLIC_ROUTES.find(r => r.methods.includes(method) && r.pattern.test(path))
  if (!route) return

  // No `CF-Connecting-IP` means this is not an external request: an SSR render
  // calling its own API, or local dev. Those must not be limited — they would
  // all share one "unknown" bucket, so a busy evening's page renders would
  // exhaust it and 429 real customers. The header is set by the edge on every
  // request that reaches the Worker from outside and cannot be removed by a
  // client, so skipping here is not a bypass.
  const ip = clientIp(event)
  if (!ip) return

  await assertRateLimit(
    event,
    [{ key: `${route.name}:ip:${ip}`, limit: route.limit, windowSeconds: route.windowSeconds }],
    route.message,
  )

  // Housekeeping, off the response path.
  await sweepRateLimits(event)
})
