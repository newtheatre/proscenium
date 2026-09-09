import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './identity'
import { venues } from './programme'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The backstage board's join (E-120). The code itself is never stored: `epoch` is the only
// state, and bumping it is what a rotation is (docs/architecture.md).

// One row per venue per night, created the first time anybody needs it: the duty manager asking
// for the code, or the first join attempt. `epoch` starts at 0 and only ever increases.
export const backstageNights = sqliteTable('backstage_nights', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  night: text('night').notNull(),
  epoch: integer('epoch').notNull().default(0),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('backstage_nights_venue_night').on(table.venueId, table.night),
  check('backstage_nights_epoch_not_negative', sql`${table.epoch} >= 0`),
  check('backstage_nights_failed_attempts_not_negative', sql`${table.failedAttempts} >= 0`),
])

// A joined device. No account and no personal data (criterion 1): `label` is whatever the
// crew member chose to type, never validated against an identity.
export const backstageDevices = sqliteTable('backstage_devices', {
  id: id(),
  nightId: text('night_id').notNull().references(() => backstageNights.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  // Which epoch admitted this device: a later rotation revokes nothing already joined, only
  // stops a new join with the old code (criterion 4 is about the code, not the roster).
  joinedEpoch: integer('joined_epoch').notNull(),
  joinedAt: integer('joined_at').notNull().default(now),
  lastSeenAt: integer('last_seen_at'),
  // Set by a manual reset (E-122 criterion 1), never by the failed-attempt rotation: a reset
  // disconnects everyone immediately, a rotation only stops a new join with the old code.
  revokedAt: integer('revoked_at'),
}, table => [
  unique('backstage_devices_token_hash').on(table.tokenHash),
  index('backstage_devices_night').on(table.nightId),
])

// Committee configuration: the fixed structured milestones a night moves through, defaulting to
// the six the story names, extensible without a migration (E-121 criterion 1).
export const backstageMilestoneTypes = sqliteTable('backstage_milestone_types', {
  id: id(),
  label: text('label').notNull(),
  sort: integer('sort').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('backstage_milestone_types_label').on(table.label),
])

// Committee configuration: one-tap routine calls (criterion 2).
export const backstagePresets = sqliteTable('backstage_presets', {
  id: id(),
  label: text('label').notNull(),
  body: text('body').notNull(),
  sort: integer('sort').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
})

// One row per message, never edited, only superseded (criterion 5). A milestone row is kept
// forever for the night report; everything else purges at 30 days (E-122 criterion 4).
export const backstageMessages = sqliteTable('backstage_messages', {
  id: id(),
  nightId: text('night_id').notNull().references(() => backstageNights.id, { onDelete: 'restrict' }),
  deviceId: text('device_id').notNull().references(() => backstageDevices.id, { onDelete: 'restrict' }),
  milestoneTypeId: text('milestone_type_id').references(() => backstageMilestoneTypes.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  supersedesId: text('supersedes_id').references((): AnySQLiteColumn => backstageMessages.id, { onDelete: 'restrict' }),
  // The client's own clock the instant the message was composed, kept even when the write
  // queues offline and sends later (criterion 6); `createdAt` is when the server received it.
  composedAt: integer('composed_at').notNull(),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('backstage_messages_night').on(table.nightId),
  uniqueIndex('backstage_messages_one_correction').on(table.supersedesId),
  check('backstage_messages_no_self_supersede', sql`${table.supersedesId} IS NULL OR ${table.supersedesId} <> ${table.id}`),
])

// Which devices have acknowledged a message, and when (criterion 4).
export const backstageAcknowledgements = sqliteTable('backstage_acknowledgements', {
  id: id(),
  messageId: text('message_id').notNull().references(() => backstageMessages.id, { onDelete: 'restrict' }),
  deviceId: text('device_id').notNull().references(() => backstageDevices.id, { onDelete: 'restrict' }),
  acknowledgedAt: integer('acknowledged_at').notNull().default(now),
}, table => [
  unique('backstage_acknowledgements_message_device').on(table.messageId, table.deviceId),
])
