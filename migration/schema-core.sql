-- The unified identity core, per docs/data-model.md. The full schema arrives with the
-- application's Drizzle migrations; this subset exists for migration rehearsals.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pronouns TEXT,
  password TEXT,
  google_sub TEXT UNIQUE,
  pending_google_email TEXT UNIQUE,
  verified INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  session_epoch INTEGER NOT NULL DEFAULT 0,
  anonymised_at INTEGER,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (NOT (email LIKE '%@newtheatre.org.uk' AND password IS NOT NULL))
);
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('MANUAL','ROSTER')),
  evidence TEXT,
  granted_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, year)
);
CREATE TABLE role_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at INTEGER,
  granted_by TEXT,
  granted_at INTEGER NOT NULL,
  note TEXT,
  expiry_warned_at INTEGER,
  UNIQUE (user_id, role)
);
CREATE TABLE totp_secrets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  confirmed_at INTEGER,
  last_used_step INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER
);
CREATE TABLE audit_archive (
  id TEXT PRIMARY KEY,
  source_app TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
