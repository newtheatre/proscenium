import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { performances, shows } from './programme'

const id = () => text('id').primaryKey()

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
