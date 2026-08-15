import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * Fixed-window counters, one row per bucket (ADR-0015). `key` encodes both the
 * action and the subject, so one table serves every limit.
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
