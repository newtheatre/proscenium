import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').notNull().unique(),
  password: text('password'), // Nullable for guest bookings
  name: text('name').notNull(),
  verified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
  lastLogin: text('last_login'),
}, table => [
  index('users_email_idx').on(table.email),
])

export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['ADMIN', 'MANAGER', 'BOX_OFFICE'] }).notNull(),
}, table => [
  index('user_roles_user_id_idx').on(table.userId),
  uniqueIndex('user_roles_user_id_role_unique').on(table.userId, table.role),
])

export const emailVerifications = sqliteTable('email_verifications', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('email_verifications_user_id_idx').on(table.userId),
  index('email_verifications_token_idx').on(table.token),
])

export const passwordResets = sqliteTable('password_resets', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('password_resets_user_id_idx').on(table.userId),
  index('password_resets_token_idx').on(table.token),
])
