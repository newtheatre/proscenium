import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`

export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  email: integer('email', { mode: 'boolean' }).notNull().default(true),
  push: integer('push', { mode: 'boolean' }).notNull().default(false),
}, table => [
  unique('notification_preferences_user_topic').on(table.userId, table.topic),
  // Transactional messages have no topic and therefore no row here, so nothing can suppress
  // one (0013, H-103).
  check('notification_preferences_topic', sql`${table.topic} IN ('BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS')`),
])

export const notificationLog = sqliteTable('notification_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  channel: text('channel').notNull(),
  subject: text('subject'),
  status: text('status').notNull(),
  // What the message was about, for reading back what somebody has already been told. No foreign
  // key: the ledger outlives what it refers to, and a message sent is a fact about the past.
  recordId: text('record_id'),
  sessionId: text('session_id'),
  // The idempotency claim, unique while it is set. A sender that must not repeat itself writes
  // one and lets the index refuse the second attempt, rather than reading first (0006, G-125).
  claim: text('claim'),
  sentAt: integer('sent_at'),
  error: text('error'),
  // Attempts made, the first one included. The retry due time is computed from this and
  // `created_at` rather than stored, so the two can never disagree (H-105).
  attempts: integer('attempts').notNull().default(0),
  // The rendered message, held only while a failed send is still owed a retry and cleared the
  // moment it reaches a terminal status. Never in a customer or operator response (H-105, 0056).
  retryPayload: text('retry_payload'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('notification_log_user').on(table.userId),
  index('notification_log_type').on(table.type),
  index('notification_log_status').on(table.status),
  index('notification_log_record').on(table.recordId),
  index('notification_log_created_at').on(table.createdAt),
  uniqueIndex('notification_log_claim').on(table.claim).where(sql`claim is not null`),
  // Kept in step with NOTIFICATION_STATUSES in shared/utils/notifications.ts, which a unit test
  // holds to this list: a status the check refuses is a send nothing can record (H-102, H-105).
  check('notification_log_status', sql`${table.status} IN ('PENDING', 'SENT', 'FAILED', 'RETRYING', 'FAILED_FINAL', 'SUPPRESSED_PREFERENCE', 'SKIPPED_UNDELIVERABLE')`),
  check('notification_log_channel', sql`${table.channel} IN ('EMAIL', 'INBOX', 'PUSH')`),
])

export const notificationDigestEntries = sqliteTable('notification_digest_entries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  type: text('type').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  // Null is the claim: the sweep's conditional UPDATE sets this to the notification_log row it
  // sent as, the same predicate-on-the-statement shape the retry sweep's claim uses (0003, H-105).
  digestLogId: text('digest_log_id').references(() => notificationLog.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  // The sweep's due query groups by topic and user over the unclaimed rows; the log id is last
  // so the same index also answers "what did this digest send" (H-104 criterion 5).
  index('notification_digest_entries_due').on(table.topic, table.userId, table.digestLogId),
  check('notification_digest_entries_topic', sql`${table.topic} IN ('BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS')`),
])

export const inboxItems = sqliteTable('inbox_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  readAt: integer('read_at'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('inbox_items_user_created').on(table.userId, table.createdAt),
])
