import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').notNull().unique(),
  password: text('password'), // Nullable for guest bookings
  name: text('name').notNull(),
  verified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),

  // Set when this user's identifying fields were replaced under the retention
  // policy. The row is kept so reservation history, repeat-booker counts and
  // revenue analysis survive; the person does not.
  anonymisedAt: text('anonymised_at'),

  // Bumped to invalidate every existing session for this user (role change,
  // password reset, force-logout). Embedded in the session and checked on each
  // authorization; a session whose epoch is stale is treated as unauthenticated.
  sessionEpoch: integer('session_epoch').notNull().default(0),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
  lastLogin: text('last_login'),
}, table => [
  index('users_email_idx').on(table.email),
])

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  emailVerifications: many(emailVerifications),
  passwordResets: many(passwordResets),
}))

export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['ADMIN', 'MANAGER', 'BOX_OFFICE'] }).notNull(),
}, table => [
  index('user_roles_user_id_idx').on(table.userId),
  uniqueIndex('user_roles_user_id_role_unique').on(table.userId, table.role),
])

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
}))

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

export const emailVerificationsRelations = relations(emailVerifications, ({ one }) => ({
  user: one(users, {
    fields: [emailVerifications.userId],
    references: [users.id],
  }),
}))

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

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}))
