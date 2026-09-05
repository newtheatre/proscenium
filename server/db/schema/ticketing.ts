import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { performances, shows } from './programme'
import { users } from './identity'

const id = () => text('id').primaryKey()
const now = sql`(unixepoch())`

// What a seat is sold as, and what it costs. Prices are integer pence at every layer (0004), and
// a type is archived once sold rather than deleted, so a historical ticket still resolves (D-119).

export const ticketTypes = sqliteTable('ticket_types', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  kind: text('kind').notNull(),
  // Set on the two types no public payload may ever carry (D-128).
  accessKind: text('access_kind'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  activeByDefault: integer('active_by_default', { mode: 'boolean' }).notNull().default(true),
}, table => [
  unique('ticket_types_name').on(table.name),
  // Standard and standard are one name to everybody who reads a report, so the database says so
  // rather than the write path alone (D-119 criterion 1).
  uniqueIndex('ticket_types_name_nocase').on(sql`${table.name} COLLATE NOCASE`),
  check('ticket_types_kind_values', sql`${table.kind} IN ('SINGLE', 'PASS_ADMISSION')`),
  check('ticket_types_access_kind_values', sql`${table.accessKind} IS NULL OR ${table.accessKind} IN ('ACCESS', 'COMPANION')`),
  check('ticket_types_price_pence', sql`${table.price} >= 0`),
])

// Resolution is performance, then show, then the type's base price. A null at either level means
// inherit; an explicit value overrides, including an explicit nought (D-120 criterion 1).
export const showTicketOverrides = sqliteTable('show_ticket_overrides', {
  id: id(),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'restrict' }),
  price: integer('price'),
  active: integer('active', { mode: 'boolean' }),
}, table => [
  unique('show_ticket_overrides_pair').on(table.showId, table.ticketTypeId),
  check('show_ticket_overrides_price_pence', sql`${table.price} IS NULL OR ${table.price} >= 0`),
])

export const performanceTicketOverrides = sqliteTable('performance_ticket_overrides', {
  id: id(),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' }),
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'restrict' }),
  price: integer('price'),
  active: integer('active', { mode: 'boolean' }),
}, table => [
  unique('performance_ticket_overrides_pair').on(table.performanceId, table.ticketTypeId),
  check('performance_ticket_overrides_price_pence', sql`${table.price} IS NULL OR ${table.price} >= 0`),
])

// One row per account. Everything special category lives inside `encrypted_payload` (0050);
// `status` and `companions` stay plain, because the database enforces them (D-127 criterion 1).
export const accessProfiles = sqliteTable('access_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('PENDING'),
  companions: integer('companions').notNull().default(0),
  encryptedPayload: text('encrypted_payload'),
  // One nonce per row, generated fresh on every write; AES-GCM is broken by nonce reuse.
  encryptionIv: text('encryption_iv'),
  // NULL means the door sees nothing, whatever else is true (D-127 criterion 2).
  consentFohAt: integer('consent_foh_at'),
  verifiedBy: text('verified_by').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: integer('verified_at'),
  expiresAt: integer('expires_at'),
  // Set on self-withdrawal; the sweep deletes the row 30 days after this (D-127 criterion 5).
  withdrawnAt: integer('withdrawn_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('access_profiles_status').on(table.status),
  index('access_profiles_withdrawn_at').on(table.withdrawnAt),
  check('access_profiles_status_values', sql`${table.status} IN ('PENDING', 'VERIFIED', 'EXPIRED', 'DECLINED', 'WITHDRAWN')`),
  check('access_profiles_companions_range', sql`${table.companions} BETWEEN 0 AND 2`),
  // Ciphertext and nonce arrive and leave together; neither means anything alone.
  check('access_profiles_payload_pair', sql`(${table.encryptedPayload} IS NULL) = (${table.encryptionIv} IS NULL)`),
])
