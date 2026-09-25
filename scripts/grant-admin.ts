#!/usr/bin/env bun
// Bootstraps the first administrator, which nothing else can do: granting a role needs
// roles.grant, and roles.grant comes from being an administrator (A-120).

import { Database } from 'bun:sqlite'
import { auditEntry } from '../shared/utils/audit'
import { defaultRoleExpiry } from '../shared/utils/roles'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'

const DEFAULT_TARGET = '.data/db/sqlite.db'

const args = process.argv.slice(2).filter(argument => argument !== '--additional')
const additional = process.argv.includes('--additional')
const email = args[0]?.trim().toLowerCase()
const target = args[1] ?? DEFAULT_TARGET

if (!email) {
  console.error('usage: bun scripts/grant-admin.ts <email> [database] [--additional]')
  console.error('Grants ADMIN to an existing account: permanent, unless a usable permanent one exists already.')
  process.exit(1)
}

// The same refusal the seed tooling makes: this writes authority, so it may only write locally.
// Production gets its first administrator through the operations runbook, not through this.
assertNotProduction()
assertLocalTarget(target)

const db = new Database(target)
const account = db.query('SELECT id, name FROM users WHERE email = ?').get(email) as { id: string, name: string } | null

if (!account) {
  console.error(`No account for ${email}. Register or sign in once first.`)
  process.exit(1)
}

// Bootstrapping is for an environment with no way in, so it refuses one that already has a way
// in: an ordinary grant is audited to a person, and this one is not (K-122 criterion 4).
const usable = db.query(`
  SELECT count(*) n, coalesce(sum(g.expires_at IS NULL), 0) permanent
  FROM role_grants g JOIN users u ON u.id = g.user_id
  WHERE g.role = 'ADMIN' AND u.disabled = 0 AND u.anonymised_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > unixepoch())
`).get() as { n: number, permanent: number }

if (usable.n > 0 && !additional) {
  console.error(`This database already has ${usable.n} usable administrator(s).`)
  console.error('Grant the role through /api/admin/roles, which records who did it.')
  console.error('Pass --additional only to build a local fixture that needs more than one.')
  process.exit(1)
}

// The first IT Manager is the one the last-IT-Manager guard keeps, and a lapse is no act it sees,
// so theirs cannot lapse; the grant is listed with the permanent ones (A-120 criterion 1, 0009).
const expiresAt = usable.permanent > 0 ? defaultRoleExpiry(new Date()) : null
const id = crypto.randomUUID().replaceAll('-', '')

// Through auditEntry even here, so the action catalogue governs every writer and not only the
// ones inside a request (0027).
const entry = auditEntry({
  actorId: null,
  action: 'role.granted.bootstrap',
  target: `user:${account.id}`,
  detail: { role: 'ADMIN', expiresAt, permanent: expiresAt === null },
})

// A lapsed grant is still the one row for this person and role, so it is renewed rather than left
// lapsed: an insert that ignored it would report a grant it never made.
db.transaction(() => {
  db.query(`INSERT INTO role_grants (id, user_id, role, expires_at, granted_by) VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT (user_id, role) DO UPDATE SET expires_at = excluded.expires_at, granted_by = NULL,
      granted_at = unixepoch(), expiry_warned_at = NULL`)
    .run(id, account.id, 'ADMIN', expiresAt)
  db.query('INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail))
})()

const until = expiresAt === null ? 'until further notice, listed with the permanent grants' : `expiring ${new Date(expiresAt * 1000).toISOString()}`
console.log(`ADMIN granted to ${account.name} <${email}>, ${until}`)
db.close()
