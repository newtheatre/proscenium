import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').notNull().unique(),
  password: text('password'), // Nullable for guest bookings
  fullName: text('full_name').notNull(),

  // Email verification
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  emailVerificationToken: text('email_verification_token'),
  emailVerificationExpires: integer('email_verification_expires', { mode: 'timestamp' }),

  // Password reset
  passwordResetToken: text('password_reset_token'),
  passwordResetExpires: integer('password_reset_expires', { mode: 'timestamp' }),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
  lastLogin: text('last_login'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
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
