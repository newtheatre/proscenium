import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { auditEntry } from './audit'
import { constraintRefusal } from './constraint-refusal'
import { endOfTerm, londonDayField, londonDay } from './membership'
import { PERMISSION_MAP, ROLES } from './roles'
import type { AuditRow } from './audit'
import type { MembershipTerm } from './membership'
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

// A trail entry that lands only while its guard still holds, so a write that lost a race leaves
// nothing behind (0006).
function guardedEntry(entry: AuditRow, guard: SQL): SQL {
  return sql`
    insert into audit_log (id, actor_id, action, target, detail)
    select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
    where exists ${guard}
  `
}

// Open, and on a person who still exists: an erasure landing between the route's read and the
// batch must not attach a membership to a tombstone (0011).
const stillOpen = (claimId: string): SQL =>
  sql`(select 1 from membership_claims c join users u on u.id = c.user_id
    where c.id = ${claimId} and c.status = 'OPEN' and u.anonymised_at is null)`

// A number another account holds: the `users_student_id` index is the whole check, and it fails
// the batch the number rides in, membership and all (0031, 0047).
const STUDENT_ID_REFUSALS = [
  { violated: 'users.student_id', says: 'Another account already holds that student number' },
]

export function studentIdConstraintRefusal(error: unknown): { statusCode: 409, statusMessage: string } | null {
  return constraintRefusal(STUDENT_ID_REFUSALS, error)
}

export interface StudentIdRecording {
  userId: string
  studentId: string
  // What the account holds now, read by the caller: the same number writes nothing.
  held: string | null
  actorId: string
  now: number
  // What must still hold at commit time; by default, that the account has not been erased.
  guard?: SQL
}

// One person, one student number, held on the account (0031). Statements, not a write, so both
// membership routes put it in their own batch; the number never reaches the trail (0011).
export function recordStudentId(input: StudentIdRecording): SQL[] {
  if (input.held === input.studentId) return []
  const guard = input.guard ?? sql`(select 1 from users where id = ${input.userId} and anonymised_at is null)`
  const entry = auditEntry({
    actorId: input.actorId,
    action: 'account.student-id.recorded',
    target: `user:${input.userId}`,
    detail: { replaced: input.held !== null },
  })
  return [
    sql`update users set student_id = ${input.studentId}, updated_at = ${input.now}
      where id = ${input.userId} and anonymised_at is null and exists ${guard}`,
    guardedEntry(entry, guard),
  ]
}

export interface MembershipGrant {
  id: string
  userId: string
  startsOn: string
  years: MembershipTerm
  evidence: string | null
  actorId: string
  now: number
  studentId?: string
  held: string | null
}

// "Record one" (A-117 criterion 4): the number, the membership and both trail entries, one batch.
export function grantMembershipStatements(input: MembershipGrant): SQL[] {
  const expiresOn = endOfTerm(input.startsOn, input.years)
  const granted = auditEntry({
    actorId: input.actorId,
    action: 'membership.granted',
    target: `user:${input.userId}`,
    detail: { membership: input.id, years: input.years, expiresOn },
  })
  const number = input.studentId
    ? recordStudentId({ userId: input.userId, studentId: input.studentId, held: input.held, actorId: input.actorId, now: input.now })
    : []
  return [
    ...number,
    sql`insert into memberships (id, user_id, starts_on, expires_on, source, evidence, granted_by)
      values (${input.id}, ${input.userId}, ${input.startsOn}, ${expiresOn}, 'MANUAL', ${input.evidence}, ${input.actorId})`,
    sql`insert into audit_log (id, actor_id, action, target, detail)
      values (${granted.id}, ${granted.actorId}, ${granted.action}, ${granted.target}, ${JSON.stringify(granted.detail)})`,
  ]
}

export interface ClaimRecording {
  claimId: string
  userId: string
  studentId: string
  // The number the account already holds; the claimed one is written only where it differs.
  held: string | null
  membership: { id: string, startsOn: string, expiresOn: string }
  actorId: string
  now: number
  entries: { granted: AuditRow, recorded: AuditRow }
}

// Every write recording a claim is, in the order the route runs them: the account's number, the
// membership by the A-117 path, the trail, and last the claim, whose status the guards read.
export function recordClaimStatements(input: ClaimRecording): SQL[] {
  const open = stillOpen(input.claimId)
  const statements: SQL[] = recordStudentId({
    userId: input.userId,
    studentId: input.studentId,
    held: input.held,
    actorId: input.actorId,
    now: input.now,
    guard: open,
  })

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

export interface ClaimWithdrawal {
  claimId: string
  userId: string
  now: number
  entry: AuditRow
}

// The member's own, and only while open: the trail entry and the withdrawal land together or not
// at all, and carry the claim id and never the number (A-130 criterion 14, 0011).
export function withdrawClaimStatements(input: ClaimWithdrawal): SQL[] {
  const own = sql`(select 1 from membership_claims
    where id = ${input.claimId} and user_id = ${input.userId} and status = 'OPEN')`
  return [
    guardedEntry(input.entry, own),
    sql`update membership_claims set status = 'WITHDRAWN', decided_at = ${input.now}
      where id = ${input.claimId} and user_id = ${input.userId} and status = 'OPEN'`,
  ]
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

// One waiting-claims notice per officer per London day, however often the sweep runs (A-130).
export function claimsWaitingClaimFor(userId: string, day: string): string {
  return `membership.claims.waiting:${userId}:${day}`
}

// How many claims wait and since when; an erased person's claim is nobody's to answer.
export function waitingClaimsStatement(): SQL {
  return sql`select count(*) as waiting, min(c.created_at) as oldest
    from membership_claims c join users u on u.id = c.user_id
    where c.status = 'OPEN' and u.anonymised_at is null`
}

// Everybody who can decide a claim: a live members.write grant on a reachable account. The role
// list is the permission map's, a constant, never a list read from rows (0006).
export function claimsDecidersStatement(now: number): SQL {
  const roles = ROLES.filter(role => PERMISSION_MAP[role].includes('members.write'))
  return sql`select distinct u.id as id from role_grants g join users u on u.id = g.user_id
    where g.role in (${sql.join(roles.map(role => sql`${role}`), sql`, `)})
      and (g.expires_at is null or g.expires_at > ${now})
      and u.anonymised_at is null and u.disabled = 0 and u.verified = 1
    order by u.id`
}
