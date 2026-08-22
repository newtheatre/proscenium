import { db, schema } from '@nuxthub/db'
import { eq, lt, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Fixed-window rate limiting, backed by D1 (ADR-0015). A single atomic upsert;
 * the window can let through twice the limit across a boundary.
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
 * Null means the request did not come from outside, so callers must skip
 * limiting rather than share one bucket between every SSR render.
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
 * Every rule is consumed even after one fails, so a caller cannot keep one
 * bucket artificially low by tripping another first.
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
 * Opportunistic rather than scheduled: one indexed delete that does not need
 * to be timely.
 */
export async function sweepRateLimits(event: H3Event, probability = 0.02): Promise<void> {
  if (Math.random() >= probability) return

  const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
  const sweep = db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, dayAgo))

  // Off the response path: the caller should not wait on housekeeping.
  const promise = Promise.resolve(sweep).then(() => undefined).catch((err: unknown) => {
    console.error('[RateLimit] Sweep failed:', err)
  })
  event.context.cloudflare?.context.waitUntil(promise)
}
