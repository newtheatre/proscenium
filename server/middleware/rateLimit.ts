/**
 * Rate limits for the endpoints reachable without a session, declared against
 * route patterns so a new public route is covered by adding a line here rather
 * than by remembering (ADR-0015).
 *
 * Buckets are per-IP. Limits are deliberately generous — student halls and the
 * theatre's wifi put many genuine customers behind one address — so these stop
 * a script rather than police a busy on-sale. The narrower case, guest
 * checkout mailing an address the attacker chose, is bounded per address
 * inside the booking handler.
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

  // No `CF-Connecting-IP` means the request did not come from outside — an SSR
  // render calling its own API, or local dev. Those must not be limited: they
  // would share one bucket and a busy evening's renders would exhaust it. The
  // header cannot be removed by a client, so skipping here is not a bypass.
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
