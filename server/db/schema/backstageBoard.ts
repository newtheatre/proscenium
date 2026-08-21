/**
 * The comms board: presets both ways, acknowledgements, and free text.
 * Polled, not socketed (ADR-0021). Design: docs/11 §2.4, §5.2 to §5.4
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { backstageNights, backstageSessions } from './backstage'
import { users } from './user'

export const BOARD_DIRECTIONS = ['FOH', 'BACKSTAGE'] as const

/**
 * The milestones worth timing. Naming them on the preset rather than matching
 * its label is what lets a society reword calls without losing the record.
 */
export const BOARD_MILESTONES = ['CLEARANCE', 'HOUSE_OPEN', 'SHOW_START', 'INTERVAL', 'RESTART', 'END'] as const

/** Admin-configurable, because each society runs its calls slightly differently. */
export const backstagePresets = sqliteTable('backstage_presets', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  direction: text('direction', { enum: BOARD_DIRECTIONS }).notNull(),
  label: text('label').notNull(),
  milestone: text('milestone', { enum: BOARD_MILESTONES }),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('backstage_presets_direction_idx').on(table.direction, table.sort),
])

/**
 * One message either way. Acknowledgement is the whole reason this exists
 * rather than a group chat, so it is a column and not an afterthought.
 */
export const backstageMessages = sqliteTable('backstage_messages', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  nightId: text('night_id').notNull().references(() => backstageNights.id, { onDelete: 'cascade' }),

  direction: text('direction', { enum: BOARD_DIRECTIONS }).notNull(),
  presetId: text('preset_id').references(() => backstagePresets.id, { onDelete: 'set null' }),
  /** Snapshot, so rewording a preset next term does not rewrite the record. */
  label: text('label').notNull(),
  milestone: text('milestone', { enum: BOARD_MILESTONES }),
  /** Set for free text; null for a preset. */
  body: text('body'),

  // Exactly one of these is set: FOH messages have a user, backstage messages
  // have a device whose name is social rather than authenticated (ADR-0020).
  senderUserId: text('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
  senderSessionId: text('sender_session_id').references(() => backstageSessions.id, { onDelete: 'set null' }),
  senderName: text('sender_name'),

  acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }),
  acknowledgedBy: text('acknowledged_by'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [
  index('backstage_messages_night_idx').on(table.nightId, table.createdAt),
])

export const backstageMessagesRelations = relations(backstageMessages, ({ one }) => ({
  night: one(backstageNights, { fields: [backstageMessages.nightId], references: [backstageNights.id] }),
}))
