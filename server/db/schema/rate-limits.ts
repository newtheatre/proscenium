import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Fixed-window counters, swept daily (docs/data-model.md). One row per bucket per window, so
// the table stays small enough that a sweep is cheap.
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull().default(0),
})
