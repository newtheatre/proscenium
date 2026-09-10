import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// The plan and the SQL a merge runs, kept pure so both are provable without a database (A-123).
// server/utils/account-merge.ts is the only caller that writes, batching this with its own audit.

// A merge tombstone is anonymisation's own shape (0011). `deleted-` is erasure's prefix,
// `merged-` is this one, and deliverability.ts already treats both as undeliverable.
export const MERGE_TOMBSTONE_NAME = 'Merged account'
export const mergedTombstoneEmail = (id: string): string => `merged-${id}@anonymised.invalid`.toLowerCase()

export interface MergeCounts {
  bookings: number
  records: number
  shifts: number
  memberships: number
  grants: number
}

export interface MergeParty {
  id: string
  name: string
  email: string
}

export interface MergePreview {
  winner: MergeParty
  loser: MergeParty
  counts: MergeCounts
}

export interface MergeOutcome {
  merged: true
  counts: MergeCounts
}

export interface GrantRow { id: string, role: string, expiresAt: number | null }
export interface GrantPlan { reassign: string[], extend: { id: string, expiresAt: number | null }[], retire: string[] }

// A record cannot be reassigned: `training_records_named_edits_only` refuses any `UPDATE`
// touching `user_id` (0010, 0041). The trigger's own correction is used instead: see below.
export interface TrainingRecordRow {
  id: string
  moduleId: string
  awardedOn: string
  expiresOn: string | null
  expiryOverridden: boolean
  source: string
  sessionId: string | null
  grantedBy: string | null
  evidenceRef: string | null
  revokedAt: number | null
  revokedBy: string | null
  revokeReason: string | null
}

const SUPERSEDED_REASON = 'Superseded: account merged'
const freshId = (): string => crypto.randomUUID().replaceAll('-', '')

// NULL is permanent (0009), so it beats any dated expiry; between two dated grants the later one
// wins.
function moreGenerous(a: number | null, b: number | null): boolean {
  if (a === null) return b !== null
  if (b === null) return false
  return a > b
}

// `role_grants` carries a unique (user_id, role), so each of the loser's grants either moves
// across untouched, or hands the winner's own row its expiry first, whichever is more generous.
export function planGrantMerge(winnerGrants: GrantRow[], loserGrants: GrantRow[]): GrantPlan {
  const reassign: string[] = []
  const extend: { id: string, expiresAt: number | null }[] = []
  const retire: string[] = []

  for (const loserGrant of loserGrants) {
    const held = winnerGrants.find(grant => grant.role === loserGrant.role)
    if (!held) {
      reassign.push(loserGrant.id)
      continue
    }
    if (moreGenerous(loserGrant.expiresAt, held.expiresAt)) extend.push({ id: held.id, expiresAt: loserGrant.expiresAt })
    retire.push(loserGrant.id)
  }

  return { reassign, extend, retire }
}

export interface MergeStatementsInput {
  winnerId: string
  loserId: string
  actorId: string
  grantPlan: GrantPlan
  trainingRecords: TrainingRecordRow[]
  now: number
}

export interface MergeStatements {
  // Bookings, records, shifts, membership and grants: what criterion 1's dry run lists (A-123).
  moves: SQL[]
  // Retired outright (criterion 5), the credential's own fate under erasure (0011). The winner's
  // own row is never a target here, so a password cannot land on a Workspace winner (0008).
  retireCredentials: SQL[]
  // Last, with `RETURNING id`: the caller checks `changes()` on this exact statement before
  // trusting the merge happened, the same shape 0049 gives every contended status write.
  tombstone: SQL
}

export function mergeStatements(input: MergeStatementsInput): MergeStatements {
  const { winnerId, loserId, actorId, grantPlan, trainingRecords, now } = input

  // A fresh row under the winner, copying the original award exactly (0041); the original is
  // revoked, if it was not already, rather than deleted (`training_records_no_delete`, G-122).
  const records: SQL[] = trainingRecords.flatMap((record) => {
    const carried = sql`insert into training_records (
        id, user_id, module_id, awarded_on, expires_on, expiry_overridden, source, session_id,
        granted_by, evidence_ref, revoked_at, revoked_by, revoke_reason, created_at
      ) values (
        ${freshId()}, ${winnerId}, ${record.moduleId}, ${record.awardedOn}, ${record.expiresOn},
        ${record.expiryOverridden ? 1 : 0}, ${record.source}, ${record.sessionId}, ${record.grantedBy},
        ${record.evidenceRef}, ${record.revokedAt}, ${record.revokedBy}, ${record.revokeReason}, ${now}
      )`
    if (record.revokedAt !== null) return [carried]
    return [
      carried,
      sql`update training_records set revoked_at = ${now}, revoked_by = ${actorId}, revoke_reason = ${SUPERSEDED_REASON}
        where id = ${record.id} and revoked_at is null`,
    ]
  })

  const moves: SQL[] = [
    sql`update room_bookings set user_id = ${winnerId} where user_id = ${loserId}`,
    sql`update room_series set user_id = ${winnerId} where user_id = ${loserId}`,
    sql`update reservations set user_id = ${winnerId} where user_id = ${loserId}`,
    ...records,
    sql`update shifts set user_id = ${winnerId} where user_id = ${loserId}`,
    sql`update memberships set user_id = ${winnerId} where user_id = ${loserId}`,
    ...grantPlan.reassign.map(id => sql`update role_grants set user_id = ${winnerId} where id = ${id}`),
    ...grantPlan.extend.map(({ id, expiresAt }) => sql`update role_grants set expires_at = ${expiresAt} where id = ${id}`),
    ...grantPlan.retire.map(id => sql`delete from role_grants where id = ${id}`),
  ]

  const retireCredentials: SQL[] = [
    sql`delete from totp_secrets where user_id = ${loserId}`,
    sql`delete from recovery_codes where user_id = ${loserId}`,
    sql`delete from passkeys where user_id = ${loserId}`,
    sql`delete from auth_tokens where user_id = ${loserId}`,
    sql`delete from passkey_challenges where user_id = ${loserId}`,
    sql`delete from mfa_attempts where user_id = ${loserId}`,
    sql`delete from room_feed_tokens where user_id = ${loserId}`,
  ]

  const tombstone = sql`
    update users set
      email = ${mergedTombstoneEmail(loserId)},
      name = ${MERGE_TOMBSTONE_NAME},
      pronouns = null,
      phone = null,
      password = null,
      password_set_at = null,
      password_last_used_at = null,
      google_sub = null,
      google_linked_at = null,
      google_last_used_at = null,
      pending_google_email = null,
      student_id = null,
      anonymised_at = ${now},
      session_epoch = session_epoch + 1,
      updated_at = ${now}
    where id = ${loserId} and anonymised_at is null
    returning id
  `

  return { moves, retireCredentials, tombstone }
}
