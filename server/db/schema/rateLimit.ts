import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * Fixed-window request counters, one row per bucket.
 *
 * D1 is the only shared store available here: the KV namespace is disabled and
 * there are no Durable Objects. That rules out the usual approaches, but the
 * volume this needs to survive is a scripted attack against a student theatre's
 * login form, not a global edge workload, and a single-statement upsert is
 * atomic enough to count correctly under concurrency.
 *
 * `key` encodes both the action and the subject — `login:ip:1.2.3.4`,
 * `forgot:email:someone@example.com` — so one table serves every limit.
 */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  /** Unix seconds. The window is [windowStart, windowStart + window). */
  windowStart: integer('window_start').notNull(),
}, table => [
  // Supports the opportunistic sweep of expired buckets.
  index('rate_limits_window_start_idx').on(table.windowStart),
])
