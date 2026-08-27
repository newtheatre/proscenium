import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

// Overrides only: defaults live in shared/utils/config.ts, and a missing row means the default
// (docs/data-model.md). A value is the key's own schema, JSON encoded.
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  // Kept when the editor is erased: the setting stands, and the audit trail says who set it.
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull(),
})
