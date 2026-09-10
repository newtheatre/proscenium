import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`

// A working copy of a content page's markdown, keyed to the same path Nuxt Content uses.
// Publishing commits it to the repository and clears the row; it never touches the live page
// itself (D-103, 0021).
export const contentDrafts = sqliteTable('content_drafts', {
  path: text('path').primaryKey(),
  body: text('body').notNull(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
})
