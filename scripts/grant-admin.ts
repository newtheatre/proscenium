#!/usr/bin/env bun
// Bootstraps the first administrator, which nothing else can do: granting a role needs
// roles.grant, and roles.grant comes from being an administrator (A-120).

import { Database } from 'bun:sqlite'
import { defaultRoleExpiry } from '../shared/utils/roles'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'

const DEFAULT_TARGET = '.data/db/sqlite.db'

const email = process.argv[2]?.trim().toLowerCase()
const target = process.argv[3] ?? DEFAULT_TARGET

if (!email) {
  console.error('usage: bun scripts/grant-admin.ts <email> [database]')
  console.error('Grants ADMIN, expiring at the committee year end, to an existing account.')
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

const expiresAt = defaultRoleExpiry(new Date())
const id = crypto.randomUUID().replaceAll('-', '')

db.transaction(() => {
  db.query('INSERT OR IGNORE INTO role_grants (id, user_id, role, expires_at, granted_by) VALUES (?, ?, ?, ?, ?)')
    .run(id, account.id, 'ADMIN', expiresAt, null)
  db.query('INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomUUID().replaceAll('-', ''), null, 'role.granted.bootstrap', `user:${account.id}`, JSON.stringify({ role: 'ADMIN', expiresAt }))
})()

console.log(`ADMIN granted to ${account.name} <${email}>, expiring ${new Date(expiresAt * 1000).toISOString()}`)
db.close()
