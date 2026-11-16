import { integer, text } from 'drizzle-orm/sqlite-core'
import { col, defineTable } from '#kit/db'

// An order prepared and unpaid ('held'), made real by settling ('paid'), or undone ('released').
export const orders = defineTable('tickets_orders', {
  id: col.id(),
  amount: col.minor('amount_minor').notNull(),
  // The share of the amount that is income later, for a performance not yet played.
  deferred: col.minor('deferred_minor').notNull().default(0),
  performanceId: col.internal(text('performance_id')),
  state: col.internal(text('state').notNull()),
  releases: col.internal(integer('releases').notNull().default(0)),
}, { id: 'tko', realm: 'operational' })

export const tables = { orders }
