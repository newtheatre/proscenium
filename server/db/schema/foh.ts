/**
 * Show-night reference material: what to do in an emergency, who to call, and
 * what happened. Design: docs/11-show-night-screen-design.md §2.5, §2.6
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { performances } from './show'
import { users } from './user'
import { venues } from './venue'

/**
 * Kept off `venues` on purpose: that row is read by public pages, and a column
 * added here must never be one missing allow-list away from the front page.
 */
export const venueEmergencyInfo = sqliteTable('venue_emergency_info', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),

  /** Read aloud to a 999 call handler, so it is stored as it should be spoken. */
  addressForEmergencyCall: text('address_for_emergency_call'),
  what3words: text('what3words'),

  evacuationProcedure: text('evacuation_procedure'),
  assemblyPoint: text('assembly_point'),
  firstAidLocation: text('first_aid_location'),
  defibrillatorLocation: text('defibrillator_location'),
  isolationPoints: text('isolation_points'),
  firePanelLocation: text('fire_panel_location'),

  updatedByUserId: text('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('venue_emergency_info_venue_unique').on(table.venueId),
])

export const venueEmergencyInfoRelations = relations(venueEmergencyInfo, ({ one }) => ({
  venue: one(venues, { fields: [venueEmergencyInfo.venueId], references: [venues.id] }),
}))

export const CONTACT_KINDS = ['COMMITTEE', 'VENUE', 'SECURITY', 'TAXI', 'OTHER'] as const

/** Numbers the door may need, tap-to-call. Not people on tonight: that is the rota. */
export const fohContacts = sqliteTable('foh_contacts', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  label: text('label').notNull(),
  phone: text('phone').notNull(),
  kind: text('kind', { enum: CONTACT_KINDS }).notNull().default('OTHER'),
  note: text('note'),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('foh_contacts_sort_idx').on(table.sort),
])

/**
 * The theatre's first structured incident record. Append-only, for the reason
 * the refusals register is (ADR-0027): one you can tidy is not a record.
 */
export const incidentLog = sqliteTable('incident_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),
  authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  body: text('body').notNull(),
  /** A correction points at what it corrects; both stay, in order. */
  supersedesId: text('supersedes_id'),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('incident_log_performance_idx').on(table.performanceId),
  index('incident_log_created_at_idx').on(table.createdAt),
])

export const incidentLogRelations = relations(incidentLog, ({ one }) => ({
  performance: one(performances, { fields: [incidentLog.performanceId], references: [performances.id] }),
  author: one(users, { fields: [incidentLog.authorUserId], references: [users.id] }),
}))
