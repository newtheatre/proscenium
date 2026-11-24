// One private feed address per person (C-70, CF1): only a keyed hash of the token is kept, and Reset
// raises the generation so the old address stops working at once.
import { integer, primaryKey, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { col, defineTable } from '#kit/db'

export const tokens = defineTable('calendar_feed_tokens', {
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'One feed each is the primary key, which must name the surviving account.' }),
  tokenHash: col.internal(text('token_hash').notNull()),
  generation: col.internal(integer('generation').notNull().default(1)),
  createdAt: col.createdAt(),
}, {
  realm: 'members',
  subject: 'account_id',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.accountId] }),
    uniqueIndex('calendar_feed_tokens_token').on(t.tokenHash),
  ],
})

export const tables = { tokens }
