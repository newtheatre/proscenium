import { db, schema } from '@nuxthub/db'
import { eq, lt, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Fixed-window rate limiting, backed by D1.
 *
 * The KV namespace is disabled and there are no Durable Objects, so D1 is the
 * only shared store. The counter is a single upsert with `RETURNING`, which
 * SQLite executes atomically, so two simultaneous requests cannot both read the
 * same count and each write back one more than it.
 *
 * A fixed window rather than a sliding one: it can let through up to twice the
 * limit across a window boundary, which is the wrong trade for billing but the
 * right one here, where the aim is to stop a script making thousands of attempts
 * and the cost of being approximate is that an attacker gets ten tries instead
 * of five.
 */

export interface RateLimitRule {
  /** Bucket identity, e.g. `login:ip:1.2.3.4`. */
  key: string
  /** Requests permitted per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

export interface RateLimitResult {
  ok: boolean
  count: number
  retryAfter: number
}

/**
 * The caller's IP, from Cloudflare's own header, or `null` when there isn't one.
 *
 * `CF-Connecting-IP` is set by the edge and cannot be spoofed by the client on a
 * Cloudflare-fronted origin, unlike `X-Forwarded-For`. Its **absence** means the
 * request did not come from outside — an SSR render calling its own API, or
 * local dev — so callers should skip limiting rather than fall back to a shared
 * bucket: every such request would share it, and a busy evening's page renders
 * would exhaust the bucket and start rejecting real customers.
 */
export function clientIp(event: H3Event): string | null {
  return getRequestHeader(event, 'cf-connecting-ip') ?? null
}

/** Count one request against a bucket and report whether it is over the limit. */
export async function consumeRateLimit({ key, limit, windowSeconds }: RateLimitRule): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - windowSeconds

  // One statement, so the read-modify-write cannot interleave. The CASE resets
  // the bucket when its window has already expired.
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} <= ${cutoff} then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${schema.rateLimits.windowStart} <= ${cutoff} then ${now} else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count, windowStart: schema.rateLimits.windowStart })

  const count = row?.count ?? 1
  const windowStart = row?.windowStart ?? now

  return {
    ok: count <= limit,
    count,
    retryAfter: Math.max(1, windowStart + windowSeconds - now),
  }
}

/**
 * Apply one or more rules, and 429 if any is exceeded.
 *
 * Every rule is consumed even when an earlier one has already failed, so a
 * caller cannot keep one bucket artificially low by tripping another first.
 */
export async function assertRateLimit(event: H3Event, rules: RateLimitRule[], message?: string): Promise<void> {
  const results = await Promise.all(rules.map(consumeRateLimit))
  const exceeded = results.filter(r => !r.ok)
  if (exceeded.length === 0) return

  const retryAfter = Math.max(...exceeded.map(r => r.retryAfter))
  setResponseHeader(event, 'retry-after', retryAfter)

  throw createError({
    statusCode: 429,
    statusMessage: message ?? 'Too many attempts. Please wait a little while and try again.',
  })
}

/**
 * Clear a bucket. Called after a successful login so a legitimate user who
 * mistyped their password a few times is not still counted against.
 */
export async function resetRateLimit(key: string): Promise<void> {
  await db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, key))
}

/**
 * Drop long-expired buckets, occasionally.
 *
 * Called opportunistically rather than on a schedule: it is one indexed delete,
 * it does not need to be timely, and a cron task would be more machinery than a
 * table of short-lived counters deserves.
 */
export async function sweepRateLimits(event: H3Event, probability = 0.02): Promise<void> {
  if (Math.random() >= probability) return

  const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
  const sweep = db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, dayAgo))

  // Off the response path — the caller should not wait on housekeeping.
  const promise = Promise.resolve(sweep).then(() => undefined).catch((err: unknown) => {
    console.error('[RateLimit] Sweep failed:', err)
  })
  event.context.cloudflare?.context.waitUntil(promise)
}
