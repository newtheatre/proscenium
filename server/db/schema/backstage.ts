import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { venues } from './programme'

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
}, table => [
  unique('backstage_devices_token_hash').on(table.tokenHash),
  index('backstage_devices_night').on(table.nightId),
])
