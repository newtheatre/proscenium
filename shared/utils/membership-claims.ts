import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { constraintRefusal } from './constraint-refusal'
import { londonDayField, londonDay } from './membership'
import type { AuditRow } from './audit'
import type { SQL } from 'drizzle-orm'

// membershipState and its MembershipState now live in membership.ts, which the viewer's ability
// resolvers read too (A-129); import from there rather than here.

// A member saying what they bought at the SU (A-130). Never a membership on its own: an officer
// records it or declines it, and SUMS stays the system of record (0031, A-202).

export const CLAIM_STATUSES = ['OPEN', 'RECORDED', 'DECLINED', 'WITHDRAWN'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

// Open is the only state anything moves from. A settled claim is history, and a declined one is
// put right by claiming again rather than by reopening (criterion 1).
export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return from === 'OPEN' && to !== 'OPEN'
}

export const CLAIM_REASON_LIMIT = 300

export const membershipClaimForm = z.object({
  studentId: z.string().trim().min(1, 'Your student number is how the SU knows you').max(32),
  // Never in the future: a purchase is something that has happened (criterion 1).
  startsOn: londonDayField.refine(day => day <= londonDay(new Date()), 'That purchase date has not happened yet'),
  term: z.union([z.literal(1), z.literal(3)]),
})

export type MembershipClaimInput = z.output<typeof membershipClaimForm>

// The one constraint a member can trip: the partial index that is criterion 1 (0047).
const CLAIM_REFUSALS = [
  { violated: 'membership_claims.user_id', says: 'You already have a claim waiting to be recorded' },
]

export function membershipClaimConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(CLAIM_REFUSALS, error)
}

export const claimDeclineForm = z.object({
  reason: z.string().trim().min(3).max(CLAIM_REASON_LIMIT),
})

export type ClaimDeclineInput = z.output<typeof claimDeclineForm>

// A trail entry that lands only while the claim is still open, so a decision that lost a race
// leaves nothing behind (0006).
function guardedEntry(entry: AuditRow, open: SQL): SQL {
  return sql`
    insert into audit_log (id, actor_id, action, target, detail)
    select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
    where exists ${open}
  `
}

// Open, and on a person who still exists: an erasure landing between the route's read and the
// batch must not attach a membership to a tombstone (0011).
const stillOpen = (claimId: string): SQL =>
  sql`(select 1 from membership_claims c join users u on u.id = c.user_id
    where c.id = ${claimId} and c.status = 'OPEN' and u.anonymised_at is null)`

export interface ClaimRecording {
  claimId: string
  userId: string
  // Null when the account already holds the claimed number, so nothing is written to it.
  studentId: string | null
  membership: { id: string, startsOn: string, expiresOn: string }
  actorId: string
  now: number
  entries: { studentId: AuditRow, granted: AuditRow, recorded: AuditRow }
}

// Every write recording a claim is, in the order the route runs them: the account's number, the
// membership by the A-117 path, the trail, and last the claim, whose status the guards read.
export function recordClaimStatements(input: ClaimRecording): SQL[] {
  const open = stillOpen(input.claimId)
  const statements: SQL[] = []

  if (input.studentId !== null) {
    statements.push(
      sql`update users set student_id = ${input.studentId}, updated_at = ${input.now}
        where id = ${input.userId} and anonymised_at is null and exists ${open}`,
      guardedEntry(input.entries.studentId, open),
    )
  }

  statements.push(
    sql`insert into memberships (id, user_id, starts_on, expires_on, source, evidence, granted_by)
      select ${input.membership.id}, ${input.userId}, ${input.membership.startsOn}, ${input.membership.expiresOn},
        'MANUAL', ${`claim ${input.claimId}`}, ${input.actorId}
      where exists ${open}`,
    guardedEntry(input.entries.granted, open),
    guardedEntry(input.entries.recorded, open),
    sql`update membership_claims set status = 'RECORDED', decided_by = ${input.actorId}, decided_at = ${input.now}
      where id = ${input.claimId} and exists ${open}`,
  )
  return statements
}

export interface ClaimDecline {
  claimId: string
  reason: string
  actorId: string
  now: number
  entry: AuditRow
}

// The reason lands on the claim for the member and never in the trail (criterion 5, 0011).
export function declineClaimStatements(input: ClaimDecline): SQL[] {
  const open = stillOpen(input.claimId)
  return [
    guardedEntry(input.entry, open),
    sql`update membership_claims
      set status = 'DECLINED', reason = ${input.reason}, decided_by = ${input.actorId}, decided_at = ${input.now}
      where id = ${input.claimId} and exists ${open}`,
  ]
}
