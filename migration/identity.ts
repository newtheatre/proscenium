// The identity transform (K-112): four user stores become one core, keyed on the canonical
// stage-door id. The old-to-new map is an input as well as an output (0015, migration/README.md).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { ROOT, nanoid } from './lib'
import { decisionKey } from './role-decisions'
import type { RoleDecisions } from './role-decisions'

export interface TransformInput {
  auth: Database
  mirrors: { source: string, db: Database }[]
  // One human decision per old grant (review-roles.ts, 0070); a grant with none is skipped and named.
  decisions: RoleDecisions
  // Read before anything is minted, and extended in place with whoever is new.
  idMap: Map<string, string>
  target: Database
  now?: number
}

export interface TransformSummary {
  users: number
  tombstones: number
  workspaceWiped: number
  emailsLowercased: number
  grantsImported: number
  grantsCollapsed: number
  grantsSkipped: number
  totp: number
  recoveryCodes: number
  [key: string]: number
}

export interface TransformResult {
  summary: TransformSummary
  exceptions: string[]
  // Live old grants nobody has decided on yet, as decision keys. One is a failed rehearsal.
  undecided: string[]
}

// The core is a subset of the application's schema, for rehearsals to reconcile against before
// anything is loaded. The application's own migrations build the real thing.
export async function createCore(path: string): Promise<Database> {
  const database = new Database(path)
  database.exec(await Bun.file(join(ROOT, 'migration/schema-core.sql')).text())
  return database
}

interface AuthUser {
  id: string
  email: string
  name: string
  password: string | null
  google_sub: string | null
  pending_google_email: string | null
  email_verified: number
  disabled: number
  session_epoch: number
  last_login: number | null
  created_at: number
  updated_at: number
}

interface Grant {
  user_id: string
  role: string
  expires_at: number | null
  granted_by: string | null
  granted_at: number | null
  note: string | null
  expiry_warned_at: number | null
}

export function transformIdentity(input: TransformInput): TransformResult {
  const { auth, mirrors, decisions, idMap, target } = input
  const now = input.now ?? Date.now()
  const exceptions: string[] = []

  const users = auth.query<AuthUser, []>('SELECT * FROM users').all()

  const insertUser = target.prepare(`
    INSERT INTO users (id, email, name, password, google_sub, pending_google_email, verified,
      disabled, session_epoch, anonymised_at, last_login_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let workspaceWiped = 0
  let tombstones = 0
  let emailsLowercased = 0
  const seen = new Map<string, string>()

  target.exec('BEGIN')
  for (const user of users) {
    // The application's schema refuses an address that is not lowercase, so normalising here is
    // the difference between a load and a failed CHECK on one row in ten thousand.
    const email = user.email.trim().toLowerCase()
    if (email !== user.email) emailsLowercased++
    const collision = seen.get(email)
    if (collision) {
      exceptions.push(`user ${user.id}: address collides with ${collision} once lowercased, not imported`)
      continue
    }
    seen.set(email, user.id)

    const id = idMap.get(user.id) ?? nanoid()
    idMap.set(user.id, id)

    // The tombstone marker in the old estate is the address suffix; it becomes a real column.
    const anonymisedAt = email.endsWith('@anonymised.invalid') ? (user.updated_at ?? now) : null
    if (anonymisedAt) tombstones++

    let password = user.password
    if (email.endsWith('@newtheatre.org.uk') && password !== null) {
      password = null
      workspaceWiped++
    }

    insertUser.run(
      id, email, user.name, password, user.google_sub, user.pending_google_email,
      user.email_verified ?? 0, user.disabled ?? 0, user.session_epoch ?? 0, anonymisedAt,
      user.last_login, user.created_at ?? now, user.updated_at ?? now,
    )
  }
  target.exec('COMMIT')

  // Mirror consistency: a mirror id absent from auth is an exception, never a guess (K-113).
  for (const { source, db } of mirrors) {
    for (const { id } of db.query<{ id: string }, []>('SELECT id FROM users').all()) {
      if (!idMap.has(id)) exceptions.push(`${source}: mirror user ${id} has no auth row`)
    }
  }

  const grants = auth.query<Grant, []>('SELECT * FROM user_roles').all()
  const insertGrant = target.prepare(
    'INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at, note, expiry_warned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )

  // Distinct old roles can collapse onto one unified role for one person; merge them, permanent
  // expiry winning over dated, latest date otherwise.
  const merged = new Map<string, { userId: string, role: string, grant: Grant, expiresAt: number | null, collapsed: number }>()
  const undecided = new Set<string>()
  let grantsSkipped = 0
  for (const grant of grants) {
    const userId = idMap.get(grant.user_id)
    if (!userId) {
      exceptions.push(`grant ${grant.role}: unknown user ${grant.user_id}`)
      grantsSkipped++
      continue
    }
    // Expired grants stay behind: enforcement was read-time, so dropping them loses nothing.
    if (grant.expires_at !== null && grant.expires_at < now) {
      grantsSkipped++
      continue
    }
    const decision = decisions.get(decisionKey(grant.user_id, grant.role))
    if (!decision) {
      undecided.add(decisionKey(grant.user_id, grant.role))
      exceptions.push(`grant ${grant.role} (user ${grant.user_id}): no decision recorded, not imported`)
      grantsSkipped++
      continue
    }
    if (decision === 'SKIP') {
      grantsSkipped++
      continue
    }
    const key = `${userId} ${decision.role}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { userId, role: decision.role, grant, expiresAt: decision.expiresAt, collapsed: 0 })
      continue
    }
    existing.collapsed++
    const held = existing.expiresAt
    const offered = decision.expiresAt
    if (offered === null || (held !== null && offered > held)) {
      existing.grant = grant
      existing.expiresAt = offered
    }
  }

  let grantsImported = 0
  let grantsCollapsed = 0
  target.exec('BEGIN')
  for (const { userId, role, grant, expiresAt, collapsed } of merged.values()) {
    // granted_by has no foreign key to catch it, so an unmapped one would land in the live
    // database as an old estate identifier (0015).
    let grantedBy: string | null = null
    if (grant.granted_by !== null) {
      grantedBy = idMap.get(grant.granted_by) ?? null
      if (grantedBy === null) {
        exceptions.push(`grant ${role} (user ${grant.user_id}): granted by an unknown ${grant.granted_by}, recorded without one`)
      }
    }
    insertGrant.run(nanoid(), userId, role, expiresAt, grantedBy, grant.granted_at ?? now, grant.note, grant.expiry_warned_at)
    grantsImported++
    grantsCollapsed += collapsed
    if (collapsed) exceptions.push(`note: ${collapsed + 1} old grants collapsed onto ${role} for one user; widest expiry kept`)
  }
  target.exec('COMMIT')

  const totp = auth.query<{ user_id: string, secret: string, confirmed_at: number | null, last_used_step: number | null, created_at: number }, []>(
    'SELECT * FROM totp_secrets',
  ).all()
  const insertTotp = target.prepare('INSERT INTO totp_secrets (user_id, secret, confirmed_at, last_used_step, created_at) VALUES (?, ?, ?, ?, ?)')
  let totpImported = 0
  for (const secret of totp) {
    const userId = idMap.get(secret.user_id)
    if (!userId) continue
    insertTotp.run(userId, secret.secret, secret.confirmed_at, secret.last_used_step, secret.created_at ?? now)
    totpImported++
  }

  const codes = auth.query<{ user_id: string, code_hash: string, used_at: number | null }, []>(
    'SELECT user_id, code_hash, used_at FROM mfa_recovery_codes',
  ).all()
  const insertCode = target.prepare('INSERT INTO recovery_codes (id, user_id, code_hash, used_at) VALUES (?, ?, ?, ?)')
  let codesImported = 0
  for (const code of codes) {
    const userId = idMap.get(code.user_id)
    if (!userId) continue
    insertCode.run(nanoid(), userId, code.code_hash, code.used_at)
    codesImported++
  }

  // Old-domain passkeys are deliberately not imported (SP-4, 0008), and neither is the old
  // estate's audit history (0030).

  return {
    summary: {
      users: seen.size,
      tombstones,
      workspaceWiped,
      emailsLowercased,
      grantsImported,
      grantsCollapsed,
      grantsSkipped,
      totp: totpImported,
      recoveryCodes: codesImported,
    },
    exceptions,
    undecided: [...undecided],
  }
}
