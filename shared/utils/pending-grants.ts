import { sql } from 'drizzle-orm'
import { constraintRefusal } from './constraint-refusal'
import type { AuditRow } from './audit'
import type { SQL } from 'drizzle-orm'

// Granting a role by address when the picker finds nobody (A-132, 0088). The grant sits on a
// shadow account, and A-116's own claim is what makes it held; there is no second claim step.

export const CHOOSE_INSTEAD = 'That address already has an account. Choose it with the search instead.'

// The unique address is the conditional write: of two racing grants, one batch fails whole (0003).
const PENDING_REFUSALS = [
  { violated: 'users.email', says: CHOOSE_INSTEAD },
]

export function pendingGrantConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(PENDING_REFUSALS, error)
}

export interface PendingGrant {
  userId: string
  grantId: string
  // Normalised by the caller: the CHECK on users refuses anything not lowercased.
  email: string
  name: string
  role: string
  expiresAt: number | null
  note: string | null
  actorId: string
  entries: { created: AuditRow, granted: AuditRow }
}

// An imported account pre-linked to this address is who Google signs in first (A-104), so a
// second account for it would take the grant away from the person it was meant for.
export const PRE_LINKED = 'That address is waiting to be linked to an existing account. Find that account with the search instead.'

function entry(row: AuditRow, made: SQL): SQL {
  return sql`insert into audit_log (id, actor_id, action, target, detail)
    select ${row.id}, ${row.actorId}, ${row.action}, ${row.target}, ${row.detail === null ? null : JSON.stringify(row.detail)}
    where exists ${made}`
}

// The account, its grant and both trail entries, in the order the route batches them. The account
// is written only while no row is pre-linked to the address, and the rest only if it was (0003).
export function pendingGrantStatements(input: PendingGrant): SQL[] {
  const made = sql`(select 1 from users where id = ${input.userId})`
  return [
    sql`insert into users (id, email, name)
      select ${input.userId}, ${input.email}, ${input.name}
      where not exists (select 1 from users where pending_google_email = ${input.email})`,
    entry(input.entries.created, made),
    sql`insert into role_grants (id, user_id, role, expires_at, granted_by, note)
      select ${input.grantId}, ${input.userId}, ${input.role}, ${input.expiresAt}, ${input.actorId}, ${input.note}
      where exists ${made}`,
    entry(input.entries.granted, made),
  ]
}

// Identifiers only: the address and the name are on the account, never in the trail (0011).
export function pendingGrantDetail(role: string, expiresAt: number | null, noted: boolean): Record<string, unknown> {
  return { role, expiresAt, permanent: expiresAt === null, noted, pending: true }
}
