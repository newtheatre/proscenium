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

function entry(row: AuditRow): SQL {
  return sql`insert into audit_log (id, actor_id, action, target, detail)
    values (${row.id}, ${row.actorId}, ${row.action}, ${row.target}, ${row.detail === null ? null : JSON.stringify(row.detail)})`
}

// The account, its grant and both trail entries, in the order the route batches them.
export function pendingGrantStatements(input: PendingGrant): SQL[] {
  return [
    sql`insert into users (id, email, name) values (${input.userId}, ${input.email}, ${input.name})`,
    entry(input.entries.created),
    sql`insert into role_grants (id, user_id, role, expires_at, granted_by, note)
      values (${input.grantId}, ${input.userId}, ${input.role}, ${input.expiresAt}, ${input.actorId}, ${input.note})`,
    entry(input.entries.granted),
  ]
}

// Identifiers only: the address and the name are on the account, never in the trail (0011).
export function pendingGrantDetail(role: string, expiresAt: number | null, noted: boolean): Record<string, unknown> {
  return { role, expiresAt, permanent: expiresAt === null, noted, pending: true }
}
