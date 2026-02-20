import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const venues = sqliteTable('venues', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  address: text('address'),
  capacity: integer('capacity'), // Default seating capacity, can be overridden at Performance level
  imageUrl: text('image_url'), // Reference to NuxtHub blob storage (Cloudflare R2)
  description: text('description'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('venues_name_idx').on(table.name),
])

export const venuesRelations = relations(venues, ({ many }) => ({
  venuesToFeatures: many(venuesToFeatures),
  // performances relation is defined in show.ts to avoid circular imports
}))

export const venueFeatures = sqliteTable('venue_features', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(), // e.g., "Wheelchair Accessible", "Hearing Loop", "Parking Available"
  description: text('description'), // Additional details about the feature
  icon: text('icon'), // e.g., an emoji or an icon class name

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('venue_features_name_idx').on(table.name),
])

export const venueFeaturesRelations = relations(venueFeatures, ({ many }) => ({
  venuesToFeatures: many(venuesToFeatures),
}))

// Junction table for many-to-many relationship between venues and features
export const venuesToFeatures = sqliteTable('venues_to_features', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  featureId: text('feature_id').notNull().references(() => venueFeatures.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('venues_to_features_venue_id_idx').on(table.venueId),
  index('venues_to_features_feature_id_idx').on(table.featureId),
])

export const venuesToFeaturesRelations = relations(venuesToFeatures, ({ one }) => ({
  venue: one(venues, {
    fields: [venuesToFeatures.venueId],
    references: [venues.id],
  }),
  feature: one(venueFeatures, {
    fields: [venuesToFeatures.featureId],
    references: [venueFeatures.id],
  }),
}))
