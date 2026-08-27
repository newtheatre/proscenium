import type { H3Event } from 'h3'
import { lt, sql } from 'drizzle-orm'
import { bucketKey, verdict, windowFor } from '#shared/utils/rate-limit'
import type { Verdict } from '#shared/utils/rate-limit'

// A conditional write, never a read then a write: two requests arriving together must not both
// see the same count (0006). No local test can prove that, which is 0022's stated limit.
async function increment(key: string, windowStart: number): Promise<number> {
  const [row] = await db.insert(schema.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        // A new window resets the count in the same statement that increments it, so no gap
        // exists in which two requests could both reset it.
        windowStart: sql`excluded.window_start`,
        count: sql`CASE WHEN ${schema.rateLimits.windowStart} = excluded.window_start THEN ${schema.rateLimits.count} + 1 ELSE 1 END`,
      },
    })
    .returning({ count: schema.rateLimits.count })

  return row?.count ?? 1
}

export interface Limit { scope: string, value: string, limit: number, windowMinutes: number }

// Records an attempt and says whether it is allowed. The attempt counts either way, so
// hammering a limited bucket keeps it limited.
export async function consume(limit: Limit, now = new Date()): Promise<Verdict> {
  const window = windowFor(now, limit.windowMinutes * 60)
  const count = await increment(bucketKey(limit.scope, limit.value), window.start)
  return verdict(count, limit.limit, window, now)
}

// Refuses with the wait, and never with anything that says whether the address is known.
export async function enforce(event: H3Event, limit: Limit, now = new Date()): Promise<void> {
  const outcome = await consume(limit, now)
  if (outcome.allowed) return

  setResponseHeader(event, 'Retry-After', outcome.retryAfterSeconds)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many attempts. Try again shortly.',
  })
}

// Swept daily by the daily:sweeps task once it exists; until then the table grows slowly and
// harmlessly, one row per bucket per window.
export async function sweepExpiredLimits(before: Date): Promise<void> {
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, Math.floor(before.getTime() / 1000)))
}
