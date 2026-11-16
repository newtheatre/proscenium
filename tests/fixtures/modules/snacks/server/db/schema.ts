import { text } from 'drizzle-orm/sqlite-core'
import { col, defineTable } from '#kit/db'

// A bar sale prepared and unpaid ('held'), completed ('sold') or undone ('released').
export const sales = defineTable('snacks_sales', {
  id: col.id(),
  amount: col.minor('amount_minor').notNull(),
  state: col.internal(text('state').notNull()),
}, { id: 'sns', realm: 'operational' })

export const tables = { sales }
