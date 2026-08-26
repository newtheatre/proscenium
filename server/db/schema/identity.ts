import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

const id = () => text('id').primaryKey()
const now = sql`(unixepoch())`

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  pronouns: text('pronouns'),
  // scrypt PHC. NULL for a guest or a Google-only account.
  password: text('password'),
  googleSub: text('google_sub').unique(),
  // Admin-set marker claiming a Workspace account before its first Google sign-in.
  pendingGoogleEmail: text('pending_google_email').unique(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  // Bumped to revoke every existing session for this user (0007).
  sessionEpoch: integer('session_epoch').notNull().default(0),
  anonymisedAt: integer('anonymised_at'),
  lastLoginAt: integer('last_login_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // Addresses are compared and deduplicated lowercased, so they are stored that way.
  check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
  // A Workspace address is Google-only and may never hold a password, including by import (0008).
  check('users_no_workspace_password', sql`${table.password} IS NULL OR ${table.email} NOT LIKE '%@newtheatre.org.uk'`),
])

export const emergencyContacts = sqliteTable('emergency_contacts', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  relation: text('relation'),
  updatedAt: integer('updated_at').notNull().default(now),
})

export const memberships = sqliteTable('memberships', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // The year containing 1 August, so 2026 runs to 31 July 2027 (0014).
  year: integer('year').notNull(),
  source: text('source').notNull(),
  evidence: text('evidence'),
  grantedBy: text('granted_by'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('memberships_user_year').on(table.userId, table.year),
  // Membership is bought at the SU, never here, so there is no purchase source (0005).
  check('memberships_source', sql`${table.source} IN ('MANUAL', 'ROSTER')`),
])

export const roleGrants = sqliteTable('role_grants', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Namespace-free officer role, validated against the permission map in shared/.
  role: text('role').notNull(),
  // NULL is permanent; the default is the next 31 July, London (0009).
  expiresAt: integer('expires_at'),
  grantedBy: text('granted_by'),
  grantedAt: integer('granted_at').notNull().default(now),
  note: text('note'),
  expiryWarnedAt: integer('expiry_warned_at'),
}, table => [
  unique('role_grants_user_role').on(table.userId, table.role),
  index('role_grants_expires_at').on(table.expiresAt),
])

export const totpSecrets = sqliteTable('totp_secrets', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  confirmedAt: integer('confirmed_at'),
  // The last accepted step, so a code cannot be replayed inside its window.
  lastUsedStep: integer('last_used_step'),
  createdAt: integer('created_at').notNull().default(now),
})

export const passkeys = sqliteTable('passkeys', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  transports: text('transports', { mode: 'json' }),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  label: text('label'),
  createdAt: integer('created_at').notNull().default(now),
  lastUsedAt: integer('last_used_at'),
})

export const recoveryCodes = sqliteTable('recovery_codes', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: integer('used_at'),
}, table => [
  index('recovery_codes_user').on(table.userId),
])

export const authTokens = sqliteTable('auth_tokens', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  // The address a verification is bound to, so changing it cannot be replayed onto another.
  email: text('email'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('auth_tokens_user_kind').on(table.userId, table.kind),
  check('auth_tokens_kind', sql`${table.kind} IN ('EMAIL_VERIFY', 'PASSWORD_RESET', 'MAGIC_LINK', 'SET_PASSWORD')`),
])
