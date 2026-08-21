/**
 * Rate limits for session-less endpoints, declared against route patterns so a
 * new public route is covered by adding a line here (ADR-0015).
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
    // Public, unauthenticated, and a lookup by reference: an unknown ref 404s,
    // which makes this an existence oracle over a 6-character space.
    name: 'booking-shortlink',
    methods: ['GET'],
    pattern: /^\/t\/[^/]+\/?$/,
    limit: 60,
    windowSeconds: 600,
  },
  {
    // Polled every couple of seconds by a joined device, so the cap is set from
    // the poll interval rather than from a guess (ADR-0015, ADR-0021).
    name: 'backstage-board',
    methods: ['GET'],
    pattern: /^\/api\/backstage\/board\/?$/,
    limit: 400,
    windowSeconds: 600,
  },
  {
    name: 'backstage-send',
    methods: ['POST'],
    pattern: /^\/api\/backstage\/messages(\/[^/]+\/ack)?\/?$/,
    limit: 120,
    windowSeconds: 600,
  },
  {
    // Public by design (safety information), so it carries a plain cap.
    name: 'backstage-emergency',
    methods: ['GET'],
    pattern: /^\/api\/backstage\/emergency\/?$/,
    limit: 60,
    windowSeconds: 600,
  },
  {
    // Six digits, guessable only by volume. The handler also rotates the code
    // once failures pass a threshold, so this is the outer of two limits.
    name: 'backstage-join',
    methods: ['POST'],
    pattern: /^\/api\/backstage\/join\/?$/,
    limit: 10,
    windowSeconds: 300,
    message: 'Too many tries. Ask the duty manager to read the code out again.',
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

  // No `CF-Connecting-IP` means the request did not come from outside, so skip
  // rather than share one bucket between every SSR render.
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
